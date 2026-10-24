"use strict";
// Real browser + real HTTP handler. Only Firebase Auth/Database are replaced;
// no Firebase SDK, credentials, production config, or external traffic is used.
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  vm = require("node:vm");
const { chromium } = require("playwright"),
  p = require("../functions/prospects");
const { policyFor, visiblePages } = require("../functions/access");
const now = "2026-10-22T18:00:00.000Z",
  rootDir = path.resolve(__dirname, "..");
function memory(seed) {
  let root = structuredClone(seed);
  const read = (key) =>
      key
        .split("/")
        .filter(Boolean)
        .reduce((v, k) => v?.[k], root),
    snap = (v) => ({ val: () => structuredClone(v ?? null) });
  return {
    root: () => root,
    ref(key = "") {
      let start = "",
        end = "",
        limit = Infinity,
        last = false;
      const ref = {
        get: async () => {
          let v = read(key);
          if (limit !== Infinity)
            v = Object.fromEntries(
              Object.entries(v || {})
                .sort(([a], [b]) => a.localeCompare(b))
                .filter(([k]) => k > start && (!end || k < end))
                .slice(last ? -limit : 0, last ? undefined : limit),
            );
          return snap(v);
        },
        set: async (value) => {
          const parts = key.split("/").filter(Boolean);
          let v = root;
          for (const part of parts.slice(0, -1)) v = v[part] ||= {};
          v[parts.at(-1)] = structuredClone(value);
        },
        update: async (value) => ref.set({ ...read(key), ...value }),
        transaction: async (fn) => {
          const next = fn(structuredClone(read(key) ?? null));
          if (next === undefined)
            return { committed: false, snapshot: snap(read(key)) };
          await ref.set(next);
          return { committed: true, snapshot: snap(next) };
        },
        orderByKey: () => ref,
        startAfter: (v) => ((start = v), ref),
        endBefore: (v) => ((end = v), ref),
        limitToFirst: (v) => ((limit = v), ref),
        limitToLast: (v) => ((limit = v), (last = true), ref),
      };
      return ref;
    },
  };
}
function fixture() {
  const users = {},
    accounts = {};
  for (const [uid, role, area, verified] of [
    ["director", "Director", null, true],
    ["charters", "Administrativo", "charters", true],
    ["school", "Administrativo", "school", true],
    ["denied", "Administrativo", null, true],
    ["unverified", "Administrativo", "school", false],
  ]) {
    users[uid] = {
      uid,
      email: uid + "@example.test",
      emailVerified: verified,
      disabled: false,
      displayName: "FICTICIO " + uid,
    };
    accounts[uid] = {
      role,
      assignedAt: now,
      email: users[uid].email,
      verified: true,
      syncedOperation: "fixture",
      syncVersion: 5,
      syncedRole: role,
      profile: { name: users[uid].displayName },
      ...(area
        ? { prospectAccess: { area, email: users[uid].email, assignedAt: now } }
        : {}),
    };
  }
  const contacts = {},
    inquiries = {};
  for (const [name, areas] of [
    ["shared", ["charters", "school"]],
    ["only-charters", ["charters"]],
    ["only-school", ["school"]],
  ]) {
    const email = name + "@example.test",
      id = p.hash(email);
    contacts[id] = {
      id,
      email,
      name: "FICTICIO " + name,
      phone: "TEST",
      areas,
      courses: areas.includes("school") ? ["privado"] : [],
      version: 1,
      status: "Nueva",
      responsible: "DIRECTOR OWNER",
      notes: "DIRECTOR NOTE",
      consent: { status: "granted", evidence: "SCHOOL CONSENT" },
      areaFollowups: {},
      areaLastInquiry: {},
    };
    inquiries[id] = {};
    for (const area of areas) {
      contacts[id].areaFollowups[area] = {
        status: area === "school" ? "En seguimiento" : "Información enviada",
        responsible: area + " OWNER",
        notes: area + " NOTE",
      };
      const inquiry = {
        at: now,
        areas: [area],
        interest: area + " HISTORY",
        channel: "WhatsApp",
        courses: area === "school" ? ["privado"] : [],
      };
      contacts[id].areaLastInquiry[area] = inquiry;
      inquiries[id][
        (area === "school" ? "1792692000001_" : "1792692000000_") +
          "a".repeat(64)
      ] = inquiry;
    }
  }
  const payload = {
    fleet: {},
    school: {
      students: [
        {
          id: "PRIVATE-STUDENT-ID",
          name: "PRIVATE-STUDENT-NAME",
          email: "shared@example.test",
          stage: "Matriculado",
          notes: "PRIVATE-STUDENT-NOTES",
        },
      ],
      registry: { clients: [], entries: [] },
      accessConfiguration: { roles: {} },
    },
  };
  return {
    users,
    db: memory({
      accountRequests: accounts,
      dashboard: { payload: JSON.stringify(payload), operation: "fixture" },
      prospects: { contacts, inquiries },
    }),
  };
}
function handler(db, users) {
  const exports = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(rootDir, "functions/index.js"), "utf8")
      .replace(/const DIRECTOR='[^']+';/, "const DIRECTOR='director';"),
    {
      exports,
      console,
      require: (id) =>
        ({
          "firebase-functions/v2/https": { onRequest: (_, fn) => fn },
          "firebase-admin/app": { initializeApp() {} },
          "firebase-admin/auth": {
            getAuth: () => ({
              verifyIdToken: async (token, checkRevoked) => {
                assert.equal(checkRevoked, true);
                if (!users[token]) throw Error("Fictional token required");
                return { uid: token };
              },
              getUser: async (uid) => users[uid],
            }),
          },
          "firebase-admin/database": { getDatabase: () => db },
        })[id] ||
        require(id.startsWith("./") ? path.join(rootDir, "functions", id) : id),
    },
  );
  return exports.accountRegistration;
}

test(
  "CRM browser permissions: isolated areas, shared contact, denial, student privacy and existing modules",
  { timeout: 120000 },
  async (t) => {
    const { users, db } = fixture(),
      api = handler(db, users),
      initialDashboard = structuredClone(db.root().dashboard),
      initialAccounts = structuredClone(db.root().accountRequests);
    // PR #16: receive web inquiries before opening the PR #15 CRM, in memory.
    const wixConfig = {
      token: "fixture-only-".repeat(5),
      siteId: "fixture-site",
      forms: { school: { area: "school" }, charters: { area: "charters" } },
    };
    for (const area of ["school", "charters"]) {
      const input = p.webhookInput({
        token: wixConfig.token,
        siteId: wixConfig.siteId,
        formId: area,
        submissionId: "fixture-" + area,
        submittedAt: now,
        name: "FICTICIO shared",
        email: "shared@example.test",
        interest: area + " WIX HISTORY",
        ...(area === "school" ? { requestedCourse: "FICTICIO SCHOOL COURSE" } : {}),
      }, wixConfig, now);
      await p.receive(db, input, now);
      assert.equal((await p.receive(db, input, now)).duplicate, true);
    }
    assert.deepEqual(db.root().dashboard, initialDashboard);
    assert.deepEqual(db.root().accountRequests, initialAccounts);
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url === "/api") {
          let body = "";
          for await (const chunk of req) body += chunk;
          await api(
            { method: "POST", headers: req.headers, body: JSON.parse(body) },
            {
              set: (k, v) => res.setHeader(k, v),
              status(n) {
                res.statusCode = n;
                return this;
              },
              json(v) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(v));
              },
              end() {
                res.end();
              },
            },
          );
          return;
        }
        if (req.url === "/test") {
          res.setHeader("Content-Type", "text/html;charset=utf-8");
          res.end(
            '<!doctype html><body><div id="dashboard-app"></div><div id="access-screen"></div><div id="content-area"></div><div id="sidebar-tabs"></div><script src="/prospects-ui.js"></script><script src="/role-portal.js"></script>',
          );
          return;
        }
        const files = {
          "/prospects-ui.js": "prospects-ui.js",
          "/role-portal.js": "role-portal.js",
        };
        if (!files[req.url]) {
          res.writeHead(404).end();
          return;
        }
        res.setHeader("Content-Type", "application/javascript");
        res.end(fs.readFileSync(path.join(rootDir, files[req.url])));
      } catch (e) {
        res.writeHead(500).end(e.message);
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    t.after(() => new Promise((r) => server.close(r)));
    const origin = "http://127.0.0.1:" + server.address().port,
      browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROME_BIN
          ? { executablePath: process.env.CHROME_BIN }
          : {}),
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
    t.after(() => browser.close());
    const contexts = [],
      errors = [],
      external = [];
    async function login(uid) {
      const context = await browser.newContext();
      contexts.push(context);
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin !== origin) {
          external.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(origin + "/test");
      await page.evaluate(async (user) => {
        window.ADMIN_UID = "unused-fictional-uid";
        window.firebase = { auth: () => ({ currentUser: user }) };
        window.isDirectorUser = () => user.uid === "director";
        window.AccountRegistration = {
          api: async (action, body = {}) => {
            const response = await fetch("/api", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                authorization: "Bearer " + user.uid,
              },
              body: JSON.stringify({ ...body, action }),
            });
            const data = await response.json();
            if (!response.ok) throw Error(data.error);
            return data;
          },
        };
        if (user.uid === "director") {
          Prospects.install();
          Prospects.open();
        } else await RolePortal.open();
      }, users[uid]);
      return page;
    }
    async function call(page, action, body = {}) {
      return page.evaluate(
        async ({ action, body }) => {
          try {
            return {
              ok: true,
              data: await AccountRegistration.api(action, body),
            };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        { action, body },
      );
    }
    async function staff(uid) {
      const page = await login(uid);
      await page
        .getByRole("button", { name: /Interesados y consultas —/ })
        .click();
      await page
        .locator("[data-count]")
        .filter({ hasText: "Lista completa" })
        .waitFor();
      return page;
    }
    const shared = p.hash("shared@example.test");
    const director = await login("director");
    await director
      .locator("[data-count]")
      .filter({ hasText: "3 contactos" })
      .waitFor();
    assert.equal(await director.locator("[data-edit]").count(), 3);
    await director.locator(`[data-edit="${shared}"]`).click();
    for (const text of ["charters NOTE", "school NOTE", "DIRECTOR NOTE"])
      assert(
        (await director.locator("dialog").textContent()).includes(text) ||
          (await director.locator("dialog [name=notes]").inputValue()) === text,
      );
    await director.locator("dialog [data-cancel]").click();

    // Director can edit a permitted record through the real form.
    await director
      .locator(`[data-edit="${p.hash("only-charters@example.test")}"]`)
      .click();
    await director.locator("dialog [name=notes]").fill("DIRECTOR UPDATED NOTE");
    await director.locator("dialog [type=submit]").click();
    await director.locator("dialog").waitFor({ state: "detached" });
    assert.equal(
      db.root().prospects.contacts[p.hash("only-charters@example.test")].notes,
      "DIRECTOR UPDATED NOTE",
    );
    const charters = await staff("charters"),
      school = await staff("school");
    for (const [page, area, other] of [
      [charters, "charters", "school"],
      [school, "school", "charters"],
    ]) {
      await page.locator("[data-refresh]").click();
      await page
        .locator("[data-message]")
        .filter({ hasText: "Área autorizada" })
        .waitFor();
      assert.equal(await page.locator("[data-edit]").count(), 2);
      const list = await call(page, "prospect-list");
      assert(list.ok);
      const wire = JSON.stringify(list.data);
      assert(
        !(await page.locator("#panel-interesados").textContent()).includes(
          "only-" + other,
        ),
      );
      for (const secret of [
        other + " NOTE",
        other + " OWNER",
        other + " HISTORY",
        "DIRECTOR NOTE",
        "PRIVATE-STUDENT",
        other + " WIX HISTORY",
      ])
        assert(!wire.includes(secret), secret);
      const wixHistory = (await call(page, "prospect-detail", { id: shared })).data;
      assert(wixHistory.inquiries.some((q) => q.interest === area + " WIX HISTORY"));
      assert(!JSON.stringify(wixHistory).includes(other + " WIX HISTORY"));
      if (area === "school") {
        assert(wixHistory.inquiries.some((q) => q.requestedCourse === "FICTICIO SCHOOL COURSE"));
      } else {
        assert(!JSON.stringify(wixHistory).includes("FICTICIO SCHOOL COURSE"));
        assert.equal(await page.locator("[data-course]").isVisible(), false);
        assert.equal(await page.locator("[data-updates]").isVisible(), false);
      }
      assert.equal(
        (
          await call(page, "prospect-detail", {
            id: p.hash("only-" + other + "@example.test"),
          })
        ).ok,
        false,
      );
      const foreign = structuredClone(
        db.root().prospects.contacts[p.hash("only-" + other + "@example.test")],
      );
      assert.equal(
        (
          await call(page, "prospect-save", {
            record: {
              ...foreign,
              notes: "FICTICIO forbidden edit",
              consentStatus: "unknown",
            },
          })
        ).ok,
        false,
      );
      assert.deepEqual(db.root().prospects.contacts[foreign.id], foreign);
      await page.locator(`[data-history="${shared}"]`).click();
      await page.locator("dialog [data-items] article").first().waitFor();
      assert(
        (await page.locator("dialog").textContent()).includes(
          area + " HISTORY",
        ),
      );
      assert(
        !(await page.locator("dialog").textContent()).includes(
          other + " HISTORY",
        ),
      );
      await page.locator("dialog [data-close]").click();
      await page.locator(`[data-edit="${shared}"]`).click();
      assert.equal(
        await page.locator("dialog [name=notes]").inputValue(),
        area + " NOTE",
      );
      assert.equal(
        await page.locator("dialog [name=responsible]").inputValue(),
        area + " OWNER",
      );
      assert.equal(
        await page.locator(`dialog [name=area][value=${other}]`).count(),
        0,
      );
      if (area === "charters") {
        assert.equal(await page.locator("dialog fieldset").nth(1).isVisible(), false);
        assert.equal(
          await page.locator("dialog [name=consentStatus]").isVisible(),
          false,
        );
        assert.equal(
          await page.locator("dialog [name=consentEvidence]").isDisabled(),
          true,
        );
      } else {
        assert.equal(
          await page.locator("dialog [name=consentEvidence]").inputValue(),
          "SCHOOL CONSENT",
        );
        await page
          .locator("dialog [name=consentStatus]")
          .selectOption("withdrawn");
        await page
          .locator("dialog [name=consentEvidence]")
          .fill("FICTICIO retiro expreso");
      }
      const oldOther = structuredClone(
          db.root().prospects.contacts[shared].areaFollowups[other],
        ),
        oldConsent = structuredClone(
          db.root().prospects.contacts[shared].consent,
        );
      await page.locator("dialog [name=notes]").fill(area + " UPDATED NOTE");
      await page
        .locator("dialog [name=responsible]")
        .fill(area + " UPDATED OWNER");
      await page.locator("dialog [name=status]").selectOption("Confirmada");
      await page
        .locator("dialog [name=interest]")
        .fill(area + " UPDATED HISTORY");
      await page.locator("dialog [type=submit]").click();
      await page.locator("dialog").waitFor({ state: "detached" });
      await page
        .locator("[data-message]")
        .filter({ hasText: "Área autorizada" })
        .waitFor();
      const saved = db.root().prospects.contacts[shared];
      assert.deepEqual(saved.areaFollowups[other], oldOther);
      assert.equal(saved.areaFollowups[area].notes, area + " UPDATED NOTE");
      assert.equal(
        saved.areaFollowups[area].responsible,
        area + " UPDATED OWNER",
      );
      assert.equal(saved.areaFollowups[area].status, "Confirmada");
      assert.equal(saved.notes, "DIRECTOR NOTE");
      if (area === "charters") assert.deepEqual(saved.consent, oldConsent);
      else assert.equal(saved.consent.status, "withdrawn");
      const view = (await call(page, "prospect-detail", { id: shared })).data;
      assert(
        view.inquiries.some((q) => q.interest === area + " UPDATED HISTORY"),
      );
      assert(
        view.inquiries.every(
          (q) => q.areas.length === 1 && q.areas[0] === area,
        ),
      );
      const record = (await call(page, "prospect-list")).data.contacts.find(
          (c) => c.id === shared,
        ),
        before = structuredClone(db.root());
      for (const patch of [
        { areas: [other] },
        { areas: ["charters", "school"] },
        ...(area === "charters"
          ? [
              {
                consentStatus: "granted",
                consentEvidence: "FICTICIO malicious consent",
              },
              { courses: ["rpa"] },
            ]
          : []),
      ])
        assert.equal(
          (
            await call(page, "prospect-save", {
              record: { ...record, ...patch },
            })
          ).ok,
          false,
        );
      assert.deepEqual(db.root(), before);
      assert.equal(
        (
          await call(page, "box-save", {
            page: "estudiantes",
            operation: "fixture",
            before: {},
            after: { school: { students: [] } },
          })
        ).ok,
        false,
      );
      assert.deepEqual(db.root().dashboard, initialDashboard);
      assert.equal(
        (await call(page, "access", { page: "estudiantes" })).ok,
        false,
      );
      assert.equal(
        (
          await call(page, "prospect-configure", {
            email: "denied@example.test",
            area,
            confirm: true,
            name: "FICTICIO",
          })
        ).ok,
        false,
      );
    }
    for (const uid of ["denied", "unverified"]) {
      const page = await login(uid);
      assert.equal(
        await page
          .getByRole("button", { name: /Interesados y consultas —/ })
          .count(),
        0,
      );
      assert.equal(await page.locator("#panel-interesados").count(), 0);
      const before = structuredClone(db.root());
      for (const [action, body] of [
        ["prospect-list", {}],
        ["prospect-detail", { id: shared }],
        [
          "prospect-save",
          {
            record: {
              email: "attempt@example.test",
              name: "FICTICIO",
              areas: ["school"],
              version: 0,
            },
          },
        ],
        ["access", { page: "estudiantes" }],
      ])
        assert.equal((await call(page, action, body)).ok, false);
      assert.deepEqual(db.root(), before);
    }
    // Revocation and loss of verification take effect on the next request in an open CRM.
    for (const patch of [
      { prospectAccess: null },
      { assignedAt: null },
      { role: "Piloto" },
    ]) {
      Object.assign(
        db.root().accountRequests.charters,
        initialAccounts.charters,
        patch,
      );
      assert.equal((await call(charters, "prospect-list")).ok, false);
    }
    db.root().accountRequests.charters = structuredClone(
      initialAccounts.charters,
    );
    users.school.emailVerified = false;
    assert.equal((await call(school, "prospect-list")).ok, false);
    users.school.emailVerified = true;
    users.director.emailVerified = false;
    assert.equal((await call(director, "prospect-list")).ok, false);
    assert.equal(
      (
        await call(director, "prospect-configure", {
          email: "denied@example.test",
          name: "FICTICIO",
          area: "school",
          confirm: true,
        })
      ).ok,
      false,
    );
    users.director.emailVerified = true;
    await director.locator("[data-refresh]").click();
    await director
      .locator("tbody")
      .filter({ hasText: "school UPDATED OWNER" })
      .waitFor();
    await director.locator(`[data-history="${shared}"]`).click();
    await director
      .locator("dialog [data-items]")
      .filter({ hasText: "school UPDATED HISTORY" })
      .waitFor();
    assert(
      (await director.locator("dialog [data-items]").textContent()).includes(
        "charters UPDATED HISTORY",
      ),
    );
    assert.deepEqual(db.root().dashboard, initialDashboard);
    assert.deepEqual(db.root().accountRequests, initialAccounts);
    assert(Object.values(db.root().prospects.inquiries[shared]).some(
      (q) => q.requestedCourse === "FICTICIO SCHOOL COURSE",
    ));
    const data = JSON.parse(initialDashboard.payload);
    for (const account of Object.values(initialAccounts)) {
      assert.deepEqual(
        policyFor(data, account),
        policyFor(data, { ...account, prospectAccess: null }),
      );
      assert.deepEqual(visiblePages(policyFor(data, account)), []);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    for (const context of contexts) await context.close();
  },
);
