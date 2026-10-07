#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  const text = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^"|"$/g, "").replace(/^'|'$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  let user = "ADMINISTRATION";
  let pass = env.HHG_PASSWORD_ADMINISTRATION;
  if (!pass) {
    user = "HOANGLE";
    pass = env.HHG_PASSWORD_HOANGLE;
  }
  if (!pass) {
    console.log("NO_PASSWORD_ENV");
    process.exit(1);
  }

  const base = "http://localhost:3000";
  const jar = { cookie: "" };

  async function req(method, urlPath, body) {
    const res = await fetch(base + urlPath, {
      method,
      headers: {
        "content-type": "application/json",
        ...(jar.cookie ? { cookie: jar.cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() || [];
    if (set.length) {
      jar.cookie = set.map((c) => c.split(";")[0]).join("; ");
    } else {
      const single = res.headers.get("set-cookie");
      if (single) jar.cookie = single.split(";")[0];
    }
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300), status: res.status };
    }
    return { status: res.status, json };
  }

  const login = await req("POST", "/api/auth/login", {
    username: user,
    password: pass,
  });
  console.log(
    "LOGIN",
    login.status,
    !!login.json.authenticated,
    login.json.user?.username,
    login.json.user?.systemRole
  );
  if (!login.json.authenticated) {
    console.log("LOGIN_FAIL", login.json);
    process.exit(1);
  }

  const list = await req("GET", "/api/projects?scope=all");
  const arr = Array.isArray(list.json) ? list.json : [];
  console.log(
    "PROJECTS",
    arr.length,
    arr[0]
      ? {
          quadrant: arr[0].quadrant,
          risk: arr[0].deadlineRisk,
          hasVC: !!arr[0].viewerContext,
        }
      : "empty"
  );

  const create = await req("POST", "/api/projects", {
    name: "SMOKE Task Lifecycle " + Date.now().toString().slice(-6),
    important: true,
    urgent: true,
    deadline: "2026-09-30",
    expectedResult: "Smoke expected result",
    proofRequired: false,
    description: "Smoke objective",
  });
  if (create.json.error) {
    console.log("CREATE_ERR", create.status, create.json.error);
    process.exit(1);
  }
  const id = create.json.id;
  console.log("CREATE", {
    id,
    status: create.json.status,
    quadrant: create.json.quadrant,
    risk: create.json.deadlineRisk,
    actions: create.json.viewerContext?.allowedActions,
    overrides: create.json.viewerContext?.adminOverrideActions,
  });

  const ack = await req("PATCH", `/api/projects/${id}`, { action: "ACKNOWLEDGE" });
  console.log(
    "ACK",
    ack.json.error || {
      ack: !!ack.json.acknowledgedAt,
      status: ack.json.status,
      actions: ack.json.viewerContext?.allowedActions?.slice(0, 8),
    }
  );

  const start = await req("PATCH", `/api/projects/${id}`, { action: "START" });
  console.log(
    "START",
    start.json.error || {
      status: start.json.status,
      progress: start.json.workPlanProgress,
      current: start.json.currentStep?.currentLabel,
      risk: start.json.deadlineRisk,
      riskReason: start.json.deadlineRiskReason,
    }
  );

  // free status dropdown should fail
  const bad = await req("PATCH", `/api/projects/${id}`, { status: "DONE" });
  console.log("FREE_STATUS", bad.json.error || "UNEXPECTED_OK");

  // complete should fail
  const complete = await req("PATCH", `/api/projects/${id}`, { action: "COMPLETE" });
  console.log("COMPLETE", complete.json.error || "UNEXPECTED_OK");

  const home = await fetch(base + "/");
  console.log("HOME", home.status);
  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
