import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export async function verifyAdminBff(
  handler: (request: Request) => Promise<Response>,
  directory: string
) {
  const cwd = resolve(directory);
  if (!existsSync(resolve(cwd, ".next/BUILD_ID")))
    throw new Error("Compile o admin antes de executar o teste integrado.");
  const base = process.env.ADMIN_TEST_BASE_PATH || "";
  if (base && !/^(?:\/[a-zA-Z0-9_-]+)+$/.test(base))
    throw new Error("Base de teste inválida.");
  const api = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  const probe = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port!;
  probe.stop(true);
  const origin = "http://localhost:" + port;
  const child = spawn(
    "node",
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NEXT_PUBLIC_ADMIN_BASE_PATH: base,
        API_URL: "http://127.0.0.1:" + api.port,
        ADMIN_ORIGIN: origin,
        PORT: String(port),
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000);
  });
  child.stderr.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000);
  });
  const request = (path: string, init?: RequestInit) =>
    fetch("http://127.0.0.1:" + port + base + path, {
      ...init,
      redirect: "manual",
    });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error("Next encerrou: " + logs);
      try {
        if ((await request("/api/health")).status === 200) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, logs);
    assert.equal((await request("/api/manage/dashboard")).status, 401);
    const redirect = await request(base ? "" : "/");
    assert.ok([307, 308].includes(redirect.status));
    assert.equal(
      new URL(redirect.headers.get("location")!, origin).pathname,
      base + "/login"
    );
    const login = {
      email: "owner@example.test",
      password: "Integration-only-password-123!",
    };
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.invalid",
          },
          body: JSON.stringify(login),
        })
      ).status,
      403
    );
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(login),
        })
      ).status,
      403
    );
    const response = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(login),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const value = (await response.json()) as {
      user: { name: string };
      token?: string;
    };
    assert.equal(value.user.name, "Owner");
    assert.equal(value.token, undefined);
    const setCookie = response.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=strict/i);
    assert.ok(setCookie.includes("Path=" + (base || "/")));
    const cookie = setCookie.split(";")[0];
    const headers = {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    };
    assert.equal(
      (await request("/api/manage/dashboard", { headers })).status,
      200
    );
    assert.equal(
      (await request("/api/manage/auth/login", { headers })).status,
      404
    );
    const documentResponse = await request("/api/manage/documents/hero", {
      headers,
    });
    assert.equal(documentResponse.status, 200);
    const document = (await documentResponse.json()) as {
      data: { title: string };
      version: number;
    };
    const body = JSON.stringify({
      data: { ...document.data, title: "Edited through Next BFF" },
      version: document.version,
    });
    assert.equal(
      (
        await request("/api/manage/documents/hero", {
          method: "PUT",
          headers: { ...headers, Origin: "https://evil.invalid" },
          body,
        })
      ).status,
      403
    );
    const saved = await request("/api/manage/documents/hero", {
      method: "PUT",
      headers,
      body,
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const publicContent = (await (
      await fetch("http://127.0.0.1:" + api.port + "/v1/content")
    ).json()) as { portfolio: { hero: { title: string } } };
    assert.equal(publicContent.portfolio.hero.title, "Edited through Next BFF");
    const panel = await request(base ? "" : "/", { headers });
    assert.equal(panel.status, 200);
    const html = await panel.text();
    assert.ok(html.includes("Owner"));
    assert.ok(!html.includes(cookie.split("=")[1]));
    const logout = await request("/api/auth/logout", {
      method: "POST",
      headers,
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/i);
    assert.equal(
      (await request("/api/manage/dashboard", { headers })).status,
      401
    );
    console.log(
      "Admin Next + API OK: cookie HttpOnly, CSRF, login, SSR, edição persistida, allowlist, logout e revogação; base " +
        (base || "/") +
        "."
    );
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, "exit");
    api.stop(true);
  }
}
