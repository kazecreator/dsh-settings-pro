window.__ModuleLoader__.load({
  id: "@kazecreator/dsh-settings-pro",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var P = require("@deepseek-ai/dsh-client-ui-primitives");

    var T = {
      text: "var(--dsw-alias-label-primary)",
      textMuted: "var(--dsw-alias-label-secondary)",
      textTertiary: "var(--dsw-alias-label-tertiary)",
      borderL2: "var(--dsw-alias-border-l2)",
      ok: "var(--dsw-alias-state-success-primary)",
      warn: "var(--dsw-alias-state-warn-primary)",
      err: "var(--dsw-alias-state-error-primary)",
    };

    var BUILTIN_TABS = [
      { id: "usage", order: 0, zh: "用量", en: "Usage" },
      { id: "memory", order: 10, zh: "记忆", en: "Memory" },
      { id: "pets", order: 20, zh: "宠物", en: "Pets" },
      { id: "vision", order: 30, zh: "视觉", en: "Vision" },
      { id: "im-bridge", order: 100, zh: "IM Bridge", en: "IM Bridge" },
      { id: "about", order: 110, zh: "关于", en: "About" },
    ];

    // The DSH locale service (ctx.locale) is the single source of truth for the
    // panel language: it mirrors the General settings "Language" preference,
    // falls back to the browser, and notifies on every change. We deliberately
    // do NOT guess from document.documentElement.lang (the DSH shell hardcodes
    // `lang="zh-CN"` in index.html) or navigator.language, which can disagree
    // with what DSH actually renders. `apply` adopts ctx.locale and subscribes
    // so the tabs, section copy and nav label all switch live.
    var uiLang = "en";
    var uiLangListeners = [];
    function setUiLang(lang) {
      if (lang !== "zh" && lang !== "en") return;
      if (uiLang === lang) return;
      uiLang = lang;
      uiLangListeners.slice().forEach(function (fn) { try { fn(lang); } catch (e) {} });
    }
    function zh(en, zh) {
      return uiLang === "zh" ? zh : en;
    }

    function withLang(url) {
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + "lang=" + encodeURIComponent(uiLang);
    }

    var tabBarStyle = {
      display: "flex",
      alignItems: "flex-end",
      gap: 22,
      borderBottom: "1px solid " + T.borderL2,
      marginTop: 2,
    };
    function tabStyle(active) {
      return {
        color: active ? T.text : T.textMuted,
        fontWeight: active ? 600 : 400,
        cursor: "pointer",
        background: "0 0",
        border: "none",
        borderBottom: active ? "2px solid " + T.text : "2px solid transparent",
        padding: "7px 1px 9px",
        fontSize: 13,
        lineHeight: "20px",
        font: "inherit",
      };
    }

    // ---- Usage panel -----------------------------------------------------
    function useUsage() {
      var state = React.useState(null);
      var setData = state[1];
      var load = function () {
        fetch(withLang("/settings-pro/usage"))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) setData(d); })
          .catch(function () {});
      };
      React.useEffect(function () {
        load();
        var timer = setInterval(load, 15000);
        return function () { clearInterval(timer); };
      }, []);
      return [state[0], load];
    }

    var rowStyle = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 };
    var labelStyle = { color: T.textTertiary, fontSize: 12 };
    var valueStyle = { color: T.text, fontSize: 13, fontVariantNumeric: "tabular-nums" };
    var cardStyle = {
      border: "1px solid " + T.borderL2,
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 16,
      background: "var(--dsw-alias-bg-module-platform)",
    };
    var titleStyle = { color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 12 };

    function Row(props) {
      return React.createElement("div", { style: rowStyle },
        React.createElement("span", { style: labelStyle }, props.label),
        React.createElement("span", { style: valueStyle }, props.value));
    }

    function fmtMoney(n, currency) {
      var sym = currency === "USD" ? "$" : "¥";
      return sym + Number(n || 0).toFixed(2);
    }

    function fmtTokens(n) {
      var v = Number(n || 0);
      if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
      if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
      return String(Math.round(v));
    }

    // Exact token count with thousands separators (matches the official page's
    // "150,476,544" instead of the abbreviated "150.48M").
    function fmtInt(n) {
      return Number(n || 0).toLocaleString("en-US");
    }

    // Placeholder shown for a disabled feature, with a one-click enable button.
    function DisabledNotice(props) {
      return React.createElement("div", { style: cardStyle },
        React.createElement("div", { style: titleStyle }, props.label),
        React.createElement("div", { style: { color: T.textMuted, fontSize: 13, marginBottom: 12 } },
          zh("Disabled by default. Enable it to start using this feature.", "该功能默认关闭，开启后即可使用。")),
        React.createElement(P.Button, { variant: "primary", size: "sm", disabled: props.busy, onClick: props.onEnable },
          zh("Enable", "开启")));
    }

    function UsagePanel() {
      var pair = useUsage();
      var data = pair[0];
      var reload = pair[1];

      var selectedDateState = React.useState("");
      var selectedDate = selectedDateState[0];
      var setSelectedDate = selectedDateState[1];

      var backfillBusyState = React.useState(false);
      var backfillBusy = backfillBusyState[0];
      var setBackfillBusy = backfillBusyState[1];

      var toggleBusyState = React.useState(false);
      var toggleBusy = toggleBusyState[0];
      var setToggleBusy = toggleBusyState[1];
      var toggleUsage = function () {
        setToggleBusy(true);
        fetch(withLang("/settings-pro/usage/toggle"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        })
          .then(function () { reload(); })
          .catch(function () {})
          .finally(function () { setToggleBusy(false); });
      };

      // Sign-in flow for the official-usage sync: when the user clicks "open
      // platform.deepseek.com", we track them leaving to sign in and returning,
      // then auto-sync the moment they come back — no extra click needed.
      var signInPhaseState = React.useState("idle"); // idle | awaiting | returned
      var signInPhase = signInPhaseState[0];
      var setSignInPhase = signInPhaseState[1];

      var syncAuto = function () {
        setBackfillBusy(true);
        setSignInPhase("idle");
        return fetch(withLang("/settings-pro/usage/backfill"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auto: true, months: 3 }),
        })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (x) { throw new Error(x && x.error ? x.error : "http " + r.status); }); })
          // The route records success/failure in the backend sync state, so
          // reload either way to reflect it in the status line immediately.
          .then(function () { reload(); })
          .catch(function () { reload(); })
          .finally(function () { setBackfillBusy(false); });
      };

      var openPlatform = function () {
        setSignInPhase("awaiting");
        window.open("https://platform.deepseek.com/usage", "_blank", "noopener,noreferrer");
      };

      // Detect leaving to sign in and returning. Entering "awaiting" means the
      // user just clicked "open" and is about to leave (or already left before
      // this effect registered); treat any subsequent focus/visible as "back".
      React.useEffect(function () {
        if (signInPhase !== "awaiting") return;
        var gone = true;
        function onVisibility() {
          if (document.visibilityState === "hidden") gone = true;
          else if (gone) setSignInPhase("returned");
        }
        function onBlur() { gone = true; }
        function onFocus() { if (gone) setSignInPhase("returned"); }
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("blur", onBlur);
        window.addEventListener("focus", onFocus);
        return function () {
          document.removeEventListener("visibilitychange", onVisibility);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("focus", onFocus);
        };
      }, [signInPhase]);

      // Auto-sync as soon as the user returns from signing in (small delay lets
      // the browser flush the platform localStorage to disk before we read it).
      React.useEffect(function () {
        if (signInPhase !== "returned") return;
        var t = setTimeout(function () { syncAuto(); }, 800);
        return function () { clearTimeout(t); };
      }, [signInPhase]);

      if (!data) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      if (data.disabled) {
        return React.createElement("div", { style: { maxWidth: 720 } },
          React.createElement(DisabledNotice, { label: zh("Usage", "用量"), onEnable: toggleUsage, busy: toggleBusy }));
      }

      var balance = data.balance;
      var balanceInfos = balance && balance.balance_infos;
      var currency = (balanceInfos && balanceInfos[0] && balanceInfos[0].currency) || "CNY";

      var children = [];

      var balChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Balance", "余额"))];
      if (Array.isArray(balanceInfos) && balanceInfos.length > 0) {
        balanceInfos.forEach(function (b, i) {
          balChildren.push(Row({ key: "cur" + i, label: zh("Currency", "币种"), value: b.currency }));
          balChildren.push(Row({ key: "tot" + i, label: zh("Total", "总计"), value: b.total_balance }));
          balChildren.push(Row({ key: "grant" + i, label: zh("Granted", "赠送"), value: b.granted_balance }));
          balChildren.push(Row({ key: "top" + i, label: zh("Topped up", "充值"), value: b.topped_up_balance }));
        });
        balChildren.push(Row({ key: "spent", label: zh("Spent (lifetime)", "累计消费"), value: fmtMoney(data.lifetimeCost || 0, currency) }));
      } else if (data.balanceError) {
        balChildren.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12 } }, data.balanceError));
      } else {
        balChildren.push(React.createElement("div", { key: "none", style: { color: T.textMuted, fontSize: 12 } }, zh("Not configured", "未配置")));
      }
      children.push(React.createElement("div", { key: "bal", style: cardStyle }, balChildren));

      // Daily usage bar chart — last 15 days; click a bar for that day's detail.
      // Official billed usage only: there is no local estimate fallback.
      var chartDays = (data.officialDaily || []).map(function (o) {
        return {
          date: o.date,
          cost: o.cost || 0,
          inputTokens: o.cacheMiss || 0,
          cacheReadTokens: o.cacheHit || 0,
          outputTokens: o.response || 0,
          models: null,
        };
      });
      chartDays.sort(function (a, b) { return a.date.localeCompare(b.date); });
      chartDays = chartDays.slice(-15);
      var todayDate = data.today;
      var todayEntry = chartDays.find(function (d) { return d.date === todayDate; });
      var selected = chartDays.find(function (d) { return d.date === selectedDate; });

      var chartChildren = [
        React.createElement("div", { key: "head", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } },
          React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: 600 } },
            zh("Usage", "用量") + " · " + zh("last 15 days", "最近 15 天") + (data.backfilled ? " · " + zh("synced", "已同步") : ""))),
      ];

      if (chartDays.length === 0) {
        chartChildren.push(React.createElement("div", { key: "empty", style: { color: T.textMuted, fontSize: 12, lineHeight: "18px" } },
          zh("No official usage yet — sync it below to see billed cost and tokens.", "暂无官方计费，请在下方同步后查看官方成本与 tokens。")));
      } else {
        var maxCost = 0;
        chartDays.forEach(function (d) { if (d.cost > maxCost) maxCost = d.cost; });
        if (maxCost <= 0) maxCost = 1;
        var barHeight = 110;
        var bars = chartDays.map(function (d) {
          var h = Math.max(2, Math.round(d.cost / maxCost * barHeight));
          var dayNum = String(Number(d.date.slice(-2)));
          var isToday = d.date === todayDate;
          var isSel = d.date === selectedDate;
          var tokens = d.inputTokens + d.cacheReadTokens + d.outputTokens;
          return React.createElement("div", {
            key: d.date,
            title: d.date + " · " + fmtMoney(d.cost, currency) + " · " + fmtInt(tokens) + " tokens",
            onClick: function () { setSelectedDate(isSel ? "" : d.date); },
            style: { display: "flex", flexDirection: "column", alignItems: "center", flex: "1 0 16px", minWidth: 16, cursor: "pointer" },
          },
            React.createElement("div", {
              style: {
                width: "70%", maxWidth: 22, height: h,
                background: isSel ? "var(--dsw-alias-state-business-primary)" : (isToday ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-button-primary-fill)"),
                borderRadius: "3px 3px 0 0", opacity: isSel ? 1 : 0.92,
              },
            }),
            React.createElement("div", { style: { fontSize: 9, color: (isToday || isSel) ? T.text : T.textTertiary, marginTop: 4, lineHeight: "12px" } }, dayNum));
        });
        var totalCost = chartDays.reduce(function (s, d) { return s + d.cost; }, 0);
        chartChildren.push(React.createElement("div", {
          key: "bars",
          style: { display: "flex", alignItems: "flex-end", gap: 3, height: barHeight + 18, paddingTop: 4, overflowX: "auto" },
        }, bars));
        chartChildren.push(React.createElement("div", { key: "tot", style: { marginTop: 10 } },
          Row({ label: zh("15-day cost", "15 天成本"), value: fmtMoney(totalCost, currency) }),
          Row({ label: zh("Today cost", "今日成本"), value: todayEntry ? fmtMoney(todayEntry.cost, currency) : "—" }),
          Row({ label: zh("Today tokens", "今日 tokens"), value: todayEntry ? fmtInt(todayEntry.inputTokens + todayEntry.cacheReadTokens + todayEntry.outputTokens) : "—" })));
      }
      children.push(React.createElement("div", { key: "chart", style: cardStyle }, chartChildren));

      // Detail for the selected day (click a bar to select).
      if (selected) {
        var hit = selected.cacheReadTokens;
        var miss = selected.inputTokens;
        var totalInput = hit + miss;
        var hitPct = totalInput > 0 ? (hit / totalInput * 100).toFixed(1) + "%" : "—";
        var detChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Detail", "明细") + " · " + selected.date)];
        detChildren.push(Row({ key: "c", label: zh("Cost", "消耗"), value: fmtMoney(selected.cost, currency) }));
        detChildren.push(Row({ key: "in", label: zh("Input", "输入"), value: fmtInt(totalInput) }));
        detChildren.push(Row({ key: "hit", label: zh("Cache hit", "输入（缓存命中）"), value: fmtInt(hit) + " · " + hitPct }));
        detChildren.push(Row({ key: "miss", label: zh("Cache miss", "输入（缓存未命中）"), value: fmtInt(miss) }));
        detChildren.push(Row({ key: "out", label: zh("Output", "输出"), value: fmtInt(selected.outputTokens) }));
        detChildren.push(Row({ key: "tot", label: zh("Total tokens", "总 tokens"), value: fmtInt(totalInput + selected.outputTokens) }));
        var modelKeys = selected.models ? Object.keys(selected.models) : [];
        if (modelKeys.length > 0) {
          detChildren.push(React.createElement("div", { key: "mh", style: { color: T.textTertiary, fontSize: 11, fontWeight: 600, marginTop: 6, marginBottom: 4 } }, zh("By model", "按模型")));
          modelKeys.forEach(function (m) {
            var ms = selected.models[m];
            var mTokens = 0;
            ["peak", "offpeak"].forEach(function (band) {
              var b = ms && ms[band];
              if (!b) return;
              mTokens += (b.inputTokens || 0) + (b.cacheReadTokens || 0) + (b.outputTokens || 0);
            });
            detChildren.push(Row({ key: "m" + m, label: m, value: fmtTokens(mTokens) }));
          });
        }
        children.push(React.createElement("div", { key: "detail", style: cardStyle }, detChildren));
      }

      // Official backfill + sync status. Auto-sync runs in the background after
      // the feature is enabled; the button below is a manual re-trigger.
      {
        var sync = data.sync || {};
        var syncState = sync.state || "idle";
        var syncChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Sync official usage", "同步官方用量"))];

        // Live status line: local busy state first, then the backend outcome.
        if (backfillBusy) {
          syncChildren.push(React.createElement("div", { key: "st", style: { color: T.textTertiary, fontSize: 12, marginBottom: 8 } },
            zh("Syncing…", "同步中…")));
        } else if (syncState === "ok") {
          var when = sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
          syncChildren.push(React.createElement("div", { key: "st", style: { color: T.ok, fontSize: 12, marginBottom: 8 } },
            when ? zh("Synced at " + when + ".", "已于 " + when + " 同步。") : zh("Synced.", "已同步。")));
        } else if (syncState === "syncing") {
          syncChildren.push(React.createElement("div", { key: "st", style: { color: T.textTertiary, fontSize: 12, marginBottom: 8 } },
            zh("Syncing…", "同步中…")));
        } else {
          // Not yet synced: show a state-specific reason, then guide the user
          // through sign-in → return → auto-sync.
          var notSyncedText;
          var notSyncedColor = T.textTertiary;
          if (syncState === "error") {
            notSyncedColor = T.err;
            notSyncedText = sync.reason === "no-session"
              ? zh("No platform login session found. Sign in at platform.deepseek.com — usage syncs automatically when you return.", "未检测到平台登录会话。请登录 platform.deepseek.com，回来后会自动同步用量。")
              : sync.reason === "token-expired"
                ? zh("Your platform login has expired. Sign in again at platform.deepseek.com — usage syncs automatically when you return.", "平台登录已过期。请重新登录 platform.deepseek.com，回来后会自动同步用量。")
                : (sync.detail || zh("Sync failed.", "同步失败。"));
          } else {
            notSyncedText = zh("Not synced yet. Sign in at platform.deepseek.com and usage syncs automatically when you return.", "尚未同步。登录 platform.deepseek.com，回来后会自动同步用量。");
          }
          syncChildren.push(React.createElement("div", { key: "st", style: { color: notSyncedColor, fontSize: 12, marginBottom: 8, lineHeight: "18px" } }, notSyncedText));

          // Sign-in flow hints: the return itself triggers an auto-sync.
          if (signInPhase === "returned") {
            syncChildren.push(React.createElement("div", { key: "back", style: { color: T.ok, fontSize: 12, fontWeight: 600, marginBottom: 8, lineHeight: "18px" } },
              zh("Welcome back — syncing your usage now.", "欢迎回来 — 正在自动同步用量。")));
          } else if (signInPhase === "awaiting") {
            syncChildren.push(React.createElement("div", { key: "back", style: { color: T.textTertiary, fontSize: 12, marginBottom: 8, lineHeight: "18px" } },
              zh("Sign in on the opened page — usage syncs automatically when you come back.", "请在打开的页面完成登录——回来后会自动同步用量。")));
          }

          syncChildren.push(React.createElement("div", { key: "open", style: { marginBottom: 8 } },
            React.createElement(P.Button, { variant: "outline", size: "sm", onClick: openPlatform },
              zh("Open platform.deepseek.com to sign in", "打开 platform.deepseek.com 登录"))));
        }

        syncChildren.push(React.createElement("div", { key: "auto", style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 } },
          React.createElement(P.Button, { variant: "primary", size: "sm", disabled: backfillBusy, onClick: syncAuto }, zh("Sync now", "立即同步")),
          React.createElement("span", { style: { color: T.textTertiary, fontSize: 12 } },
            zh("Pulls platform-billed cost and token breakdown.", "拉取 DeepSeek 平台官方计费的成本与 token 明细。"))));
        syncChildren.push(React.createElement("div", { key: "compat", style: { color: T.textTertiary, fontSize: 12, marginTop: 6, lineHeight: "18px" } },
          zh(
            "Auto-sync reads the sign-in session from a Chromium-based browser (Chrome / Edge / Brave / Arc / Opera on macOS / Windows / Linux). Firefox / Safari are not supported.",
            "自动同步读取本机 Chromium 内核浏览器（Chrome / Edge / Brave / Arc / Opera，macOS / Windows / Linux）的登录会话；Firefox / Safari 不支持。")));
        children.push(React.createElement("div", { key: "sync", style: cardStyle }, syncChildren));
      }

      return React.createElement("div", { style: { maxWidth: 720 } }, children);
    }

    // ---- Memory panel ----------------------------------------------------
    function useMemory() {
      var state = React.useState(null);
      var setData = state[1];
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(withLang("/settings-pro/memory"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setData(d); })
            .catch(function () {});
        };
        load();
        var timer = setInterval(load, 5000);
        return function () { disposed = true; clearInterval(timer); };
      }, []);
      return [state[0], setData];
    }

    function MemoryPanel() {
      var pair = useMemory();
      var data = pair[0];
      var setData = pair[1];

      var confirmState = React.useState(false);
      var confirming = confirmState[0];
      var setConfirming = confirmState[1];

      var presetState = React.useState("all"); // all | today | 7d | 30d
      var preset = presetState[0];
      var setPreset = presetState[1];

      var toggleBusyState = React.useState(false);
      var toggleBusy = toggleBusyState[0];
      var setToggleBusy = toggleBusyState[1];
      var toggleMemory = function () {
        setToggleBusy(true);
        fetch(withLang("/settings-pro/memory/toggle"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        })
          .then(function () {
            fetch(withLang("/settings-pro/memory"))
              .then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) { if (d) setData(d); })
              .catch(function () {});
          })
          .catch(function () {})
          .finally(function () { setToggleBusy(false); });
      };

      if (!data) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      if (data.disabled) {
        return React.createElement("div", { style: { maxWidth: 720 } },
          React.createElement(DisabledNotice, { label: zh("Memory", "记忆"), onEnable: toggleMemory, busy: toggleBusy }));
      }

      var summary = data.summary || "";
      var days = data.days || [];
      var today = data.today || "";

      var post = function (path, body) {
        return fetch(withLang(path), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {}),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) setData(d); })
          .catch(function () {});
      };

      // Calendar-date arithmetic (timezone-safe: pure y/m/d, no UTC parsing).
      var addDays = function (dateStr, n) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
        var d = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)) + n);
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, "0");
        var dd = String(d.getDate()).padStart(2, "0");
        return y + "-" + m + "-" + dd;
      };

      var rangeForPreset = function () {
        if (preset === "today") return { from: today, to: today };
        if (preset === "7d") return { from: addDays(today, -6), to: today };
        if (preset === "30d") return { from: addDays(today, -29), to: today };
        return { from: "", to: "" }; // all
      };

      var exportMemory = function () {
        var r = rangeForPreset();
        var qs = [];
        if (r.from) qs.push("from=" + encodeURIComponent(r.from));
        if (r.to) qs.push("to=" + encodeURIComponent(r.to));
        var base = "/settings-pro/memory/export.md" + (qs.length > 0 ? "?" + qs.join("&") : "");

        var fname;
        if (r.from && r.to) fname = r.from === r.to ? r.from : r.from + "_" + r.to;
        else if (r.from) fname = "from-" + r.from;
        else if (r.to) fname = "to-" + r.to;
        else fname = "all";

        var a = document.createElement("a");
        a.href = withLang(base);
        a.download = "memory-" + fname + ".md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      var children = [];

      // Summary — read-only (written by the assistant via write_memory).
      children.push(React.createElement("div", { key: "sum", style: cardStyle },
        React.createElement("div", { key: "t", style: titleStyle }, zh("Summary", "摘要")),
        React.createElement("div", { key: "s", style: { color: T.text, fontSize: 13, whiteSpace: "pre-wrap" } }, summary || zh("(empty)", "（空）"))));

      // Notes grouped by date (newest day first) — read-only.
      var totalNotes = 0;
      var dayBlocks = [];
      days.forEach(function (day) {
        var dNotes = day.notes || [];
        totalNotes += dNotes.length;
        var block = [React.createElement("div", { key: "h", style: { color: T.textTertiary, fontSize: 11, fontWeight: 600, marginBottom: 6 } },
          day.date + (day.compacted ? " · " + zh("compacted", "已合并") + " " + day.compacted + " " + zh("items", "条") : ""))];
        if (day.digest) {
          block.push(React.createElement("div", { key: "d", style: { color: T.textMuted, fontSize: 12, whiteSpace: "pre-wrap", marginBottom: 6 } }, day.digest));
        }
        dNotes.forEach(function (n, i) {
          var when = new Date(n.ts).toLocaleTimeString();
          block.push(React.createElement("div", { key: "n" + i, style: { marginBottom: 6 } },
            React.createElement("span", { style: { color: T.textTertiary, fontSize: 11 } }, when + " · "),
            React.createElement("span", { style: { color: T.text, fontSize: 13, whiteSpace: "pre-wrap" } }, n.text)));
        });
        dayBlocks.push(React.createElement("div", { key: day.date, style: { marginBottom: 14 } }, block));
      });

      var noteChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Notes", "记录") + " · " + totalNotes)];
      if (dayBlocks.length > 0) {
        noteChildren.push(React.createElement("div", { key: "list", style: { maxHeight: 360, overflowY: "auto" } }, dayBlocks));
      } else {
        noteChildren.push(React.createElement("div", { key: "none", style: { color: T.textMuted, fontSize: 12 } }, zh("No notes yet", "暂无记录")));
      }
      children.push(React.createElement("div", { key: "notes", style: cardStyle }, noteChildren));

      // Export — quick presets, custom range, MD/JSON format, download + copy.
      var presetChips = [
        { id: "all", label: zh("All", "全部") },
        { id: "today", label: zh("Today", "今天") },
        { id: "7d", label: zh("Last 7 days", "最近7天") },
        { id: "30d", label: zh("Last 30 days", "最近30天") },
      ];
      var exportChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Export", "导出"))];
      exportChildren.push(React.createElement("div", { key: "presets", style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 } },
        presetChips.map(function (c) {
          var sel = preset === c.id;
          return React.createElement(P.Button, {
            key: c.id,
            variant: "outline",
            size: "sm",
            style: sel ? { fontWeight: 600 } : undefined,
            onClick: function () { setPreset(c.id); },
          }, (sel ? "✓ " : "") + c.label);
        })));
      // The single action button, styled like the theme's other primary buttons
      // (unified look), kept small to match the preset chips.
      exportChildren.push(React.createElement(P.Button, {
        key: "dl",
        variant: "primary",
        size: "sm",
        onClick: exportMemory,
      }, zh("Download Markdown (.md)", "下载 Markdown (.md)")));
      children.push(React.createElement("div", { key: "export", style: cardStyle }, exportChildren));

      // Clear (needs an explicit second confirm).
      if (confirming) {
        children.push(React.createElement("div", { key: "confirm", style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" } },
          React.createElement("span", { style: { color: T.err, fontSize: 12 } }, zh("Clear all memory? This cannot be undone.", "确认清空全部记忆？此操作不可恢复。")),
          React.createElement(P.Button, { variant: "primary", size: "sm", onClick: function () { setConfirming(false); post("/settings-pro/memory/clear"); } }, zh("Yes, clear", "确认清空")),
          React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: function () { setConfirming(false); } }, zh("Cancel", "取消"))));
      } else {
        children.push(React.createElement("div", { key: "actions", style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          React.createElement(P.Button, { variant: "outline", size: "sm", onClick: function () { setConfirming(true); } }, zh("Clear", "清空"))));
      }

      return React.createElement("div", { style: { maxWidth: 720 } }, children);
    }

    // ---- Pets panel ------------------------------------------------------
    function usePets() {
      var state = React.useState(null);
      var setData = state[1];
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(withLang("/settings-pro/pets"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setData(d); })
            .catch(function () {});
        };
        load();
        var timer = setInterval(load, 5000);
        // Live status pushes keep the floating pet's bubble in sync without
        // waiting for the poll. The server throttles these to ~2/sec.
        var es = new EventSource("/pets/events");
        es.onmessage = function (e) {
          try {
            var msg = JSON.parse(e.data);
            if (msg.type === "pet-status" && msg.status && !disposed) setData(msg.status);
            else if (msg.type === "pet-changed" && !disposed) load();
          } catch (err) {}
        };
        return function () { disposed = true; clearInterval(timer); es.close(); };
      }, []);
      return [state[0], setData];
    }

    function fmtDuration(ts) {
      var s = Math.max(0, Math.round((Date.now() - (ts || 0)) / 1000));
      if (s < 60) return s + "s";
      var m = Math.floor(s / 60);
      if (m < 60) return m + "m" + (s % 60) + "s";
      var h = Math.floor(m / 60);
      var mm = m % 60;
      if (h < 24) return mm > 0 ? h + "h" + mm + "m" : h + "h";
      var d = Math.floor(h / 24);
      var hh = h % 24;
      return hh > 0 ? d + "d" + hh + "h" : d + "d";
    }

    // The pet bubble follows the DSH locale (carried on the status snapshot as
    // `lang`), falling back to the panel's UI language only when absent.
    function petLang(data) {
      return data && (data.lang === "zh" || data.lang === "en") ? data.lang : uiLang;
    }
    function petZh(lang, en, zh) { return lang === "zh" ? zh : en; }
    function petIsDark() {
      try { return typeof document !== "undefined" && !!document.body && document.body.hasAttribute("data-ds-dark-theme"); }
      catch (e) { return false; }
    }

    // DSH-trajectory style: [en, zh] name + icon + [light, dark] color per type,
    // localized to the DSH system language.
    var PET_KINDS = {
      read: ["Read", "读取文件", "📄", "#2563eb", "#93c5fd"],
      edit: ["Edit", "修改文件", "✏️", "#d97706", "#fbbf24"],
      write: ["Write", "写入文件", "📝", "#16a34a", "#86efac"],
      bash: ["Bash", "执行命令", "💻", "#7c3aed", "#c4b5fd"],
      grep: ["Grep", "搜索代码", "🔍", "#0e7490", "#67e8f9"],
      glob: ["Glob", "查找文件", "🔎", "#0d9488", "#5eead4"],
      web_search: ["Web Search", "搜索网络", "🌐", "#0284c7", "#7dd3fc"],
      ask_user_question: ["Ask", "等待确认", "❓", "#ea580c", "#fdba74"],
      todo_write: ["Todo", "更新任务清单", "✅", "#6b7280", "#9ca3af"],
      subagent: ["Agent", "委派子代理", "🤖", "#4f46e5", "#a5b4fc"],
      subagent_fork: ["Agent", "委派子代理", "🤖", "#4f46e5", "#a5b4fc"],
      read_image: ["Image", "查看图片", "🖼️", "#db2777", "#f9a8d4"],
      read_memory: ["Memory", "读取记忆", "🧠", "#7c3aed", "#c4b5fd"],
      write_memory: ["Memory", "写入记忆", "🧠", "#7c3aed", "#c4b5fd"],
      get_usage: ["Usage", "查询用量", "📊", "#6b7280", "#9ca3af"],
    };
    function petKindMeta(name) {
      return PET_KINDS[name] || [String(name || ""), String(name || ""), "🔧", "#6b7280", "#9ca3af"];
    }
    function petToolName(m, lang) {
      return lang === "zh" ? m[1] : m[0];
    }
    function petKind(name, icon, color) {
      return React.createElement("span", { style: { flex: "none", fontWeight: 600, color: color } }, icon + " " + name);
    }
    function petArg(text) {
      return React.createElement("span", { style: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: T.textMuted } }, text);
    }
    function petTime(text) {
      return React.createElement("span", { style: { flex: "none", fontSize: 11, opacity: 0.6 } }, text);
    }
    function petNowRow(children) {
      return React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap", maxWidth: "100%" } }, children);
    }

    // Channel tags (web owner / telegram / wechat) for multi-channel attribution.
    var PET_CHANNELS = {
      web: ["Web", "Web", "🖥️", "#6b7280", "#9ca3af"],
      telegram: ["TG", "TG", "✈️", "#0284c7", "#7dd3fc"],
      wechat: ["WeChat", "微信", "💬", "#d97706", "#fbbf24"],
    };
    function petChannelMeta(c) {
      return PET_CHANNELS[c] || PET_CHANNELS.web;
    }
    function petChannelBadge(c, lang) {
      var dark = petIsDark();
      var m = petChannelMeta(c);
      return petKind(lang === "zh" ? m[1] : m[0], m[2], dark ? m[4] : m[3]);
    }
    function petChannelLabel(c, lang) {
      var m = petChannelMeta(c);
      return m[2] + " " + (lang === "zh" ? m[1] : m[0]);
    }

    function progressBar(n, m) {
      var width = 10;
      if (!(n > 0) || !(m > 0)) return "";
      var filled = Math.max(1, Math.min(width, Math.round((n / m) * width)));
      var out = "[";
      for (var i = 0; i < filled; i++) out += "█";
      for (var j = filled; j < width; j++) out += "░";
      return out + "]";
    }

    function petActLabel(entry, lang) {
      var dark = petIsDark();
      var badge = petChannelBadge(entry && entry.channel, lang);
      var type = entry && entry.type;
      switch (type) {
        case "user/message":
          return petNowRow([badge, petKind(petZh(lang, "User", "用户"), "👤", dark ? "#93c5fd" : "#2563eb")]);
        case "assistant/message":
          return petNowRow([badge, petKind(petZh(lang, "Reply", "回复"), "💬", dark ? "#93c5fd" : "#2563eb"), petTime("· " + fmtDuration(entry && entry.ts))]);
        case "tool/call": {
          var m = petKindMeta(entry && entry.tool);
          var kids = [badge, petKind(petToolName(m, lang), m[2], dark ? m[4] : m[3])];
          if (entry && entry.detail) kids.push(petArg(entry.detail));
          kids.push(petTime("· " + fmtDuration(entry && entry.ts)));
          return petNowRow(kids);
        }
        case "turn/start":
          return petNowRow([badge, petKind(petZh(lang, "Think", "思考"), "💭", dark ? "#c4b5fd" : "#7c3aed")]);
        case "turn/end": {
          var r = entry && entry.reason;
          var err = dark ? "#fca5a5" : "#dc2626";
          var ok = dark ? "#86efac" : "#16a34a";
          if (r === "error") return petNowRow([badge, petKind(petZh(lang, "Failed", "失败"), "⚠️", err)]);
          if (r === "aborted" || r === "interrupted") return petNowRow([badge, petKind(petZh(lang, "Cancelled", "已取消"), "⚠️", err)]);
          if (r === "blocked") return petNowRow([badge, petKind(petZh(lang, "Blocked", "已拦截"), "⚠️", err)]);
          if (r === "max-tokens") return petNowRow([badge, petKind(petZh(lang, "Too long", "超出长度限制"), "⚠️", err)]);
          return petNowRow([badge, petKind(petZh(lang, "Done", "完成"), "✅", ok)]);
        }
        default: return null;
      }
    }

    function petNowLine(data) {
      var lang = petLang(data);
      var dark = petIsDark();
      var jobs = data.liveJobs || [];
      if (jobs.length > 0) {
        var j = jobs[0];
        var label = String(j.label || j.kind || "").trim();
        var kids = [petKind(petZh(lang, "Job", "任务"), "⏳", dark ? "#c4b5fd" : "#7c3aed")];
        if (label) kids.push(petArg(label));
        if (jobs.length > 1) kids.push(petTime("+ " + (jobs.length - 1)));
        kids.push(petTime("· " + fmtDuration(j.startedAt)));
        return petNowRow(kids);
      }
      var activeTurn = (data.activeTurns || 0) > 0;
      // While a turn is open, the freshest activity is authoritative; otherwise
      // only a very fresh entry counts, so a stale tool call never lingers.
      if (data.streaming === "reasoning") {
        var kids2 = [petKind(petZh(lang, "Think", "思考"), "💭", dark ? "#c4b5fd" : "#7c3aed")];
        if (data.reasoningText) kids2.push(petArg(data.reasoningText));
        return petNowRow(kids2);
      }
      if (data.streaming === "text") {
        return petNowRow([petKind(petZh(lang, "Reply", "回复"), "💬", dark ? "#93c5fd" : "#2563eb")]);
      }
      var acts = (data.recentActivity || []).filter(function (a) {
        return Date.now() - ((a && a.ts) || 0) < (activeTurn ? 90000 : 15000);
      });
      if (acts.length > 0) return petActLabel(acts[0], lang);
      if (activeTurn) return petNowRow([petKind(petZh(lang, "Think", "思考"), "💭", dark ? "#c4b5fd" : "#7c3aed")]);
      return null;
    }

    function petMultiSummary(data, lang) {
      var goals = data.activeGoals || [];
      var jobs = data.liveJobs || [];
      var turns = data.activeTurns || 0;
      var channels = data.activeChannels || [];
      var multi = goals.length > 1 || jobs.length > 1 || turns > 1 || channels.length > 1;
      if (!multi) return null;
      var bits = [];
      if (channels.length > 1) bits.push(channels.map(function (c) { return petChannelLabel(c, lang); }).join(" · "));
      if (turns > 1) bits.push(petZh(lang, turns + " chats", turns + " 对话"));
      if (goals.length > 1) bits.push(petZh(lang, goals.length + " goals", goals.length + " 目标"));
      if (jobs.length > 1) bits.push(petZh(lang, jobs.length + " jobs", jobs.length + " 任务"));
      return React.createElement("div", { key: "multi", style: { color: T.textMuted, fontSize: 11, marginBottom: 2 } },
        petZh(lang, "Concurrent", "同时") + " · " + bits.join(" · "));
    }

    function petStatusText(data) {
      var lang = petLang(data);
      var dark = petIsDark();
      if (!data.enabled) return petNowRow([petKind(petZh(lang, "Paused", "已暂停"), "⏸️", dark ? "#9ca3af" : "#6b7280")]);
      var goals = data.activeGoals || [];
      var parts = [];

      // 0) Multi-task / multi-channel summary (only when 2+ things are live).
      var summary = petMultiSummary(data, lang);
      if (summary) parts.push(summary);

      // 1) Context — the goal (or, without one, the in-progress todo), tagged
      // with its channel so Telegram/WeChat/Web goals are distinguishable.
      if (goals.length > 0) {
        var g = goals[0];
        var obj = String(g.objective || "").trim();
        var gBadge = petChannelBadge(g.channel, lang);
        var gMore = goals.length > 1 ? " +" + (goals.length - 1) : "";
        if (g.phase === "blocked") {
          parts.push(React.createElement("div", { key: "goal", style: { whiteSpace: "pre-line", overflowWrap: "break-word" } }, gBadge, " 🚧 " + obj + gMore));
        } else {
          parts.push(React.createElement("div", { key: "goal", style: { whiteSpace: "pre-line", overflowWrap: "break-word" } }, gBadge, " 🎯 " + obj + gMore));
          if (g.roundsStarted > 0 && g.maxGoalRounds > 0) {
            parts.push(React.createElement("div", { key: "progress", style: { color: T.textMuted, fontSize: 11, marginTop: 2 } }, progressBar(g.roundsStarted, g.maxGoalRounds) + " " + petZh(lang, "Round " + g.roundsStarted + "/" + g.maxGoalRounds, "第 " + g.roundsStarted + "/" + g.maxGoalRounds + " 轮")));
          } else if (g.phase === "paused") {
            parts.push(React.createElement("div", { key: "progress", style: { color: T.textMuted, fontSize: 11 } }, petZh(lang, "Paused", "已暂停")));
          }
        }
      }

      // 2) What it's doing right now.
      var now = petNowLine(data);
      if (now) parts.push(now);

      if (parts.length === 0) return petNowRow([petKind(petZh(lang, "Watching", "监控中"), "👀", dark ? "#9ca3af" : "#6b7280")]);
      return parts;
    }

    function PetsOverlay() {
      var data = usePets();

      var posState = React.useState(function () {
        try {
          var raw = window.localStorage.getItem("dsh-pet-pos");
          if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
      });
      var pos = posState[0];
      var setPos = posState[1];
      var dragState = React.useState(null);
      var drag = dragState[0];
      var setDrag = dragState[1];

      React.useEffect(function () {
        if (!drag) return;
        var latest = drag.base;
        var onMove = function (e) {
          latest = { x: e.clientX - drag.offsetX, y: e.clientY - drag.offsetY };
          latest = { x: Math.max(0, Math.min(latest.x, window.innerWidth - 64)), y: Math.max(0, Math.min(latest.y, window.innerHeight - 64)) };
          setPos(latest);
        };
        var onUp = function () {
          try { window.localStorage.setItem("dsh-pet-pos", JSON.stringify(latest)); } catch (e) {}
          setDrag(null);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return function () {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
      }, [drag]);

      if (!data) return null;

      var style = {
        position: "fixed",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        cursor: "grab",
        userSelect: "none",
      };
      if (pos) { style.left = pos.x; style.top = pos.y; }
      else { style.right = 16; style.bottom = 16; }

      var onMouseDown = function (e) {
        e.preventDefault();
        var el = e.currentTarget.getBoundingClientRect();
        var base = pos || { x: window.innerWidth - el.width - 16, y: window.innerHeight - el.height - 16 };
        setPos(base);
        setDrag({ base: base, offsetX: e.clientX - base.x, offsetY: e.clientY - base.y });
      };

      var bubbleStyle = {
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid " + T.borderL2,
        borderRadius: 10,
        padding: "4px 10px",
        fontSize: 12,
        lineHeight: "16px",
        color: T.text,
        boxShadow: "var(--dsw-shadow-lv2)",
        whiteSpace: "pre-line",
        maxWidth: 240,
        overflowWrap: "break-word",
        wordBreak: "break-word",
      };
      var bodyStyle = {
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: "var(--dsw-alias-bg-layer-2)",
        border: "1px solid " + T.borderL2,
        boxShadow: "var(--dsw-shadow-lv2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
      };

      return React.createElement("div", { style: style, onMouseDown: onMouseDown },
        React.createElement("div", { style: bubbleStyle }, petStatusText(data)),
        React.createElement("div", { style: bodyStyle }, "🐾"));
    }

    var PET_STATES = ["idle", "working", "goal", "paused"];
    var PET_STATE_LABELS = { idle: "Idle", working: "Working", goal: "Goal", paused: "Paused" };

    function readAsDataUrl(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(file);
      });
    }

    function usePetList() {
      var state = React.useState(null);
      var setData = state[1];
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(withLang("/pets/list"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setData(d); })
            .catch(function () {});
        };
        load();
        return function () { disposed = true; };
      }, []);
      return [state[0], setData];
    }

    function useCatalog() {
      var state = React.useState(null);
      var setData = state[1];
      var errState = React.useState(null);
      var setErr = errState[1];
      React.useEffect(function () {
        var disposed = false;
        fetch(withLang("/pets/catalog"))
          .then(function (r) {
            return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e && e.error ? e.error : "http " + r.status); });
          })
          .then(function (d) { if (!disposed) { setData(d); setErr(null); } })
          .catch(function (e) { if (!disposed) setErr(e && e.message ? e.message : String(e)); });
        return function () { disposed = true; };
      }, []);
      return [state[0], setData, errState[0]];
    }

    // Live install progress streamed over the shared /pets/events SSE channel,
    // keyed by pet id. The install button reads it to show a real progress bar.
    function useInstallProgress() {
      var state = React.useState({});
      var setProgress = state[1];
      React.useEffect(function () {
        var es = new EventSource("/pets/events");
        es.onmessage = function (e) {
          try {
            var msg = JSON.parse(e.data);
            if (msg.type !== "install-progress") return;
            setProgress(function (prev) {
              var next = Object.assign({}, prev);
              next[msg.petId] = { phase: msg.phase, percent: msg.percent, error: msg.error };
              return next;
            });
          } catch (err) {}
        };
        return function () { es.close(); };
      }, []);
      return state[0];
    }

    // CSS-sprite frame: slice one cell out of a sprite-sheet atlas. Pixel-based
    // sizing/positioning avoids the sub-pixel bleed of percentage positioning.
    function spriteStyle(sprite, state, col, size) {
      var row = (sprite.states && sprite.states[state]) || 0;
      var cols = sprite.cols || 8;
      var rows = sprite.rows || 9;
      var cellW = sprite.cellW || 192;
      var cellH = sprite.cellH || 208;
      var scale = size / cellW;
      var w = Math.round(cellW * scale);
      var h = Math.round(cellH * scale);
      return {
        width: w + "px",
        height: h + "px",
        backgroundImage: "url(" + sprite.url + ")",
        backgroundSize: (cols * w) + "px " + (rows * h) + "px",
        backgroundPosition: "-" + (col * w) + "px -" + (row * h) + "px",
        backgroundRepeat: "no-repeat",
        imageRendering: "pixelated",
      };
    }

    // Sprite atlases leave trailing columns transparent; detect the real frame
    // count per row once, then cache it.
    var spriteFrameCountCache = {};
    function detectSpriteFrameCount(sprite, state, done) {
      var row = (sprite.states && sprite.states[state]) || 0;
      var key = sprite.url + "|" + row;
      if (spriteFrameCountCache[key] != null) { done(spriteFrameCountCache[key]); return; }
      var img = new Image();
      img.onload = function () {
        var count = sprite.cols || 8;
        try {
          var cw = sprite.cellW || 192;
          var ch = sprite.cellH || 208;
          var cols = sprite.cols || 8;
          var canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          var last = -1;
          var y0 = row * ch;
          for (var c = 0; c < cols; c++) {
            var data = ctx.getImageData(c * cw, y0, cw, ch).data;
            var has = false;
            for (var i = 3; i < data.length; i += 4) {
              if (data[i] > 8) { has = true; break; }
            }
            if (has) last = c;
          }
          if (last >= 0) count = last + 1;
        } catch (err) {}
        spriteFrameCountCache[key] = count;
        done(count);
      };
      img.onerror = function () {
        var count = sprite.cols || 8;
        spriteFrameCountCache[key] = count;
        done(count);
      };
      img.src = sprite.url;
    }

    // Animated sprite-sheet pet (cycles only the non-empty frames of the row).
    function SpritePet(props) {
      var sprite = props.sprite;
      var cols = (sprite && sprite.cols) || 8;
      var fps = props.fps || 8;
      var frameState = React.useState(0);
      var frame = frameState[0];
      var setFrame = frameState[1];
      var countState = React.useState(null); // null = not detected yet
      var frameCount = countState[0];
      var setFrameCount = countState[1];
      React.useEffect(function () {
        var disposed = false;
        setFrame(0);
        setFrameCount(null);
        detectSpriteFrameCount(sprite, props.state || "idle", function (count) {
          if (!disposed) setFrameCount(count > 0 ? count : cols);
        });
        return function () { disposed = true; };
      }, [sprite, props.state]);
      React.useEffect(function () {
        if (frameCount == null) return;
        var timer = setInterval(function () { setFrame(function (f) { return (f + 1) % frameCount; }); }, Math.round(1000 / fps));
        return function () { clearInterval(timer); };
      }, [fps, frameCount]);
      return React.createElement("div", { style: spriteStyle(sprite, props.state || "idle", frame, props.size || 64) });
    }

    function petThumb(pet, size) {
      if (pet.sprite) return React.createElement(SpritePet, { sprite: pet.sprite, state: "idle", size: size, fps: 8 });
      var idle = pet.states && pet.states.idle;
      if (!idle) return React.createElement("div", { style: { width: size, height: size } });
      if (idle.kind === "svg") {
        var svg = String(idle.value).replace(/width="84" height="84"/, 'width="' + size + '" height="' + size + '"');
        return React.createElement("div", {
          style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" },
          dangerouslySetInnerHTML: { __html: svg },
        });
      }
      return React.createElement("img", { src: idle.url, alt: "", style: { width: size, height: size, objectFit: "contain" } });
    }

    function FilePicker(props) {
      var ref = React.useRef(null);
      var boxStyle = {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        border: "1px dashed " + T.borderL2,
        borderRadius: 8,
        cursor: "pointer",
        background: "var(--dsw-alias-bg-layer-2)",
      };
      return React.createElement("div", { style: boxStyle, onClick: function () { if (ref.current) ref.current.click(); } },
        React.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: props.value ? T.text : T.textMuted, fontSize: 12 } },
          props.value || props.placeholder || zh("Click to choose file", "点击选择文件")),
        React.createElement("span", { style: { color: T.textTertiary, fontSize: 11, flexShrink: 0 } }, props.hint || zh("Choose", "选择")),
        React.createElement("input", {
          ref: ref,
          type: "file",
          accept: props.accept,
          style: { display: "none" },
          onChange: function (e) {
            var f = e.target.files && e.target.files[0];
            if (f && props.onFile) props.onFile(f);
            e.target.value = "";
          },
        }));
    }

    function PetsPanel() {
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var pair = usePets();
      var data = pair[0];
      var setData = pair[1];

      var listPair = usePetList();
      var list = listPair[0];
      var setList = listPair[1];

      var errState = React.useState("");
      var err = errState[0];
      var setErr = errState[1];
      var installingIdState = React.useState("");
      var installingId = installingIdState[0];
      var setInstallingId = installingIdState[1];
      var catalogPair = useCatalog();
      var catalog = catalogPair[0];
      var setCatalog = catalogPair[1];
      var catalogErr = catalogPair[2];
      var catalogQueryState = React.useState("");
      var catalogQuery = catalogQueryState[0];
      var setCatalogQuery = catalogQueryState[1];
      var catalogRefreshingState = React.useState(false);
      var catalogRefreshing = catalogRefreshingState[0];
      var setCatalogRefreshing = catalogRefreshingState[1];

      var progress = useInstallProgress();
      var onlineRef = React.useRef(null);

      if (!data || !list) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      var toggle = function () {
        setBusy(true);
        fetch(withLang("/settings-pro/pets/toggle"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !data.enabled }),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) setData(d); })
          .catch(function () {})
          .finally(function () { setBusy(false); });
      };

      var postList = function (path, body) {
        setBusy(true);
        return fetch(withLang(path), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body || {}),
        })
          .then(function (r) {
            return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e && e.error ? e.error : "http " + r.status); });
          })
          .then(function (d) { if (d) setList(d); return d; })
          .catch(function (e) { setErr(e && e.message ? e.message : String(e)); })
          .finally(function () { setBusy(false); });
      };

      var select = function (id) { setErr(""); postList("/pets/select", { id: id }); };
      var removePet = function (id) { setErr(""); postList("/pets/remove", { id: id }); };
      var installCodexPet = function (id) {
        setErr("");
        setInstallingId(id);
        postList("/pets/install-codex", { id: id }).then(function () {
          fetch(withLang("/pets/catalog"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d) setCatalog(d); })
            .catch(function () {});
        }).finally(function () { setInstallingId(""); });
      };
      var refreshCatalog = function () {
        setErr("");
        setCatalogRefreshing(true);
        fetch(withLang("/pets/catalog/refresh"), { method: "POST" })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (e) { throw new Error(e && e.error ? e.error : "http " + r.status); }); })
          .then(function (d) { if (d) setCatalog(d); })
          .catch(function (e) { setErr(e && e.message ? e.message : String(e)); })
          .finally(function () { setCatalogRefreshing(false); });
      };

      var saveSize = function (value) {
        if (value == null) return;
        fetch(withLang("/settings-pro/pets/size"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size: value }),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.petSize) setData(function (prev) { return Object.assign({}, prev, { petSize: d.petSize }); }); })
          .catch(function () {});
      };

      var saveOpenMode = function (mode) {
        fetch(withLang("/settings-pro/pets/open-mode"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: mode }),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && d.petOpenMode) setData(function (prev) { return Object.assign({}, prev, { petOpenMode: d.petOpenMode }); }); })
          .catch(function () {});
      };

      var children = [];

      // Head: toggle.
      var headChildren = [
        React.createElement("div", { key: "t", style: titleStyle }, zh("Pet", "宠物")),
        React.createElement("div", { key: "d", style: { color: T.textTertiary, fontSize: 12, marginBottom: 12 } },
          zh("The pet monitors conversations and jobs and reports progress via status bubbles — it never creates goals or drives the agent.", "开启后，宠物只监控对话与任务，通过状态泡泡报告进度——不会创建目标、也不会自动驱动对话。")),
        React.createElement(P.Button, {
          key: "b",
          variant: data.enabled ? "primary" : "outline",
          size: "sm",
          disabled: busy,
          onClick: toggle,
        }, data.enabled ? zh("Disable", "关闭") : zh("Enable", "开启")),
        React.createElement("div", { key: "size", style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 } },
          React.createElement("span", { style: { color: T.textTertiary, fontSize: 12, flexShrink: 0 } }, zh("Size", "大小")),
          [
            { label: zh("Small", "小"), size: 84 },
            { label: zh("Medium", "中"), size: 112 },
            { label: zh("Large", "大"), size: 140 },
          ].map(function (s) {
            var sel = (data.petSize || 84) <= 98 ? 84 : (data.petSize || 84) >= 126 ? 140 : 112;
            return React.createElement(P.Button, {
              key: s.size,
              variant: sel === s.size ? "primary" : "outline",
              size: "sm",
              onClick: function () { saveSize(s.size); },
            }, s.label);
          })),
        React.createElement("div", { key: "openmode", style: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 } },
          React.createElement("span", { style: { color: T.textTertiary, fontSize: 12, flexShrink: 0 } }, zh("Clicking the pet opens", "点击宠物后打开")),
          React.createElement(P.Button, {
            variant: (data.petOpenMode || "browser") === "browser" ? "primary" : "outline",
            size: "sm",
            onClick: function () { saveOpenMode("browser"); },
          }, zh("Browser", "网页")),
          React.createElement(P.Button, {
            variant: (data.petOpenMode || "browser") === "app" ? "primary" : "outline",
            size: "sm",
            onClick: function () { saveOpenMode("app"); },
          }, zh("App", "App"))),
        React.createElement("div", { key: "note", style: { color: T.textTertiary, fontSize: 12, marginTop: 10, lineHeight: "18px" } },
          zh(
            "Browser mode opens /pet in a browser tab — no extra install. App mode requires the separate desktop pet app (Electron), which is not bundled with this package.",
            "网页模式在浏览器标签页打开 /pet，无需额外安装。App 模式需要另行安装桌面宠物应用（Electron），npm 包不包含它。")),
      ];
      children.push(React.createElement("div", { key: "head", style: cardStyle }, headChildren));

      // Catalog.
      var pets = list.pets || [];
      var activeId = list.active;
      var catChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Pets", "宠物") + " · " + pets.length)];
      pets.forEach(function (p) {
        var isActive = p.id === activeId;
        catChildren.push(React.createElement("div", {
          key: p.id,
          style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + T.borderL2 },
        },
          petThumb(p, 44),
          React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: isActive ? 600 : 400 } }, uiLang === "zh" && p.nameZh ? p.nameZh : p.name),
            React.createElement("div", { style: { color: T.textTertiary, fontSize: 11 } }, p.source === "codex" ? zh("Online", "在线库") : zh("Custom", "自定义"))),
          isActive
            ? React.createElement(P.Button, { variant: "outline", size: "sm", disabled: true }, zh("Active", "使用中"))
            : React.createElement(P.Button, { variant: "primary", size: "sm", disabled: busy, onClick: function () { select(p.id); } }, zh("Use", "使用")),
          React.createElement(P.Button, { variant: "ghost", size: "sm", disabled: busy, onClick: function () { removePet(p.id); } }, zh("Delete", "删除"))));
      });
      if (pets.length === 0) {
        catChildren.push(React.createElement("div", {
          key: "empty",
          style: { border: "1px dashed " + T.borderL2, borderRadius: 10, padding: "14px 16px", background: "var(--dsw-alias-bg-layer-2)" },
        },
          React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: 600, marginBottom: 4 } }, zh("No pets yet", "还没有宠物")),
          React.createElement("div", { style: { color: T.textMuted, fontSize: 12, marginBottom: 10 } },
            zh("Install your first pet from the online library to get started.", "从在线库安装你的第一个宠物开始使用。")),
          React.createElement(P.Button, {
            variant: "primary",
            size: "sm",
            onClick: function () { if (onlineRef.current) onlineRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); },
          }, zh("Install first pet", "去安装第一个宠物"))));
      }
      children.push(React.createElement("div", { key: "catalog", style: cardStyle }, catChildren));

      // Online library (Awesome Codex Pet).
      var catalogList = (catalog && catalog.pets) || [];
      var fetchedAtText = catalog && catalog.fetchedAt
        ? new Date(catalog.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      var catalogChildren = [
        React.createElement("div", { key: "t", style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 } },
          React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: 600 } }, zh("Online library", "在线库") + " · " + catalogList.length),
          React.createElement(P.Button, { variant: "outline", size: "sm", disabled: catalogRefreshing, onClick: refreshCatalog },
            catalogRefreshing ? zh("Refreshing…", "刷新中…") : zh("Refresh", "刷新"))),
        React.createElement("div", { key: "auto", style: { color: T.textTertiary, fontSize: 11, marginBottom: 8, lineHeight: "16px" } },
          zh("Catalog refreshes automatically once a week" + (fetchedAtText ? " · last updated " + fetchedAtText : "") + ".",
             "目录每周自动更新" + (fetchedAtText ? " · 上次更新 " + fetchedAtText : "") + "。")),
      ];
      if (!catalog) {
        if (catalogErr) {
          catalogChildren.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12, lineHeight: "18px" } },
            zh("Online library unavailable — you appear to be offline. Cached pets still work; retry once online.", "在线库不可用（可能离线）。已安装的宠物仍可正常使用，联网后重试即可。")));
        } else {
          catalogChildren.push(React.createElement("div", { key: "loading", style: { color: T.textMuted, fontSize: 12 } }, zh("Loading…", "加载中…")));
        }
      } else {
        var qRaw = String(catalogQuery).trim();
        var q = qRaw.toLowerCase();
        var tokens = q === "" ? [] : q.split(/\s+/).filter(Boolean);
        var searchRow = [
          React.createElement(P.Input, {
            key: "in",
            value: catalogQuery,
            placeholder: zh("Search name / author / category…", "搜索名称 / 作者 / 分类…"),
            style: { flex: 1 },
            onChange: function (e) { setCatalogQuery(e.target.value); },
          }),
        ];
        if (q !== "") {
          searchRow.push(React.createElement(P.Button, {
            key: "clear",
            variant: "ghost",
            size: "sm",
            onClick: function () { setCatalogQuery(""); },
          }, "✕"));
        }
        catalogChildren.push(React.createElement("div", { key: "q", style: { display: "flex", gap: 8, marginBottom: 8 } }, searchRow));

        // Match every whitespace-separated token against name/zh/author/category/
        // description, so multi-word queries narrow down instead of erroring.
        var filtered = q === "" ? catalogList : catalogList.filter(function (p) {
          var hay = (p.name + " " + (p.nameZh || "") + " " + (p.category || "") + " " + (p.author || "") + " " + (p.description || "")).toLowerCase();
          return tokens.every(function (t) { return hay.indexOf(t) >= 0; });
        });
        if (q !== "") {
          catalogChildren.push(React.createElement("div", { key: "count", style: { color: T.textTertiary, fontSize: 11, marginBottom: 6 } },
            zh("matches", "匹配") + ": " + filtered.length));
        }
        // Installed pets first, then alphabetical (by localized name). The pet
        // being installed stays in place instead of jumping to the top.
        var shown = filtered.slice().sort(function (a, b) {
          if (a.installed !== b.installed) return a.installed ? -1 : 1;
          var na = (a.nameZh || a.name).toLowerCase();
          var nb = (b.nameZh || b.name).toLowerCase();
          return na < nb ? -1 : na > nb ? 1 : 0;
        });
        if (shown.length === 0) {
          catalogChildren.push(React.createElement("div", { key: "empty", style: { color: T.textMuted, fontSize: 12 } }, zh("No matches", "无匹配")));
        } else {
          catalogChildren.push(React.createElement("div", { key: "list", style: { maxHeight: 380, overflowY: "auto" } },
            shown.map(function (p) {
              var label = uiLang === "zh" && p.nameZh ? p.nameZh : p.name;
              var installing = p.id === installingId;
              var prog = progress[p.id];
              var pct = prog && typeof prog.percent === "number" ? Math.max(0, Math.min(100, prog.percent)) : 0;
              var button;
              if (p.installed) {
                button = React.createElement(P.Button, { variant: "outline", size: "sm", disabled: true }, zh("Installed", "已安装"));
              } else if (installing) {
                var phaseLabel = prog && prog.phase === "error"
                  ? zh("Failed", "失败")
                  : zh("Installing", "安装中") + " " + pct + "%";
                button = React.createElement("div", { style: { width: 92, flexShrink: 0 } },
                  React.createElement("div", { style: { height: 6, borderRadius: 3, background: T.borderL2, overflow: "hidden" } },
                    React.createElement("div", {
                      style: {
                        width: Math.max(4, pct) + "%",
                        height: "100%",
                        borderRadius: 3,
                        background: prog && prog.phase === "error" ? T.err : "var(--dsw-alias-button-primary-fill)",
                        transition: "width .2s ease",
                      },
                    })),
                  React.createElement("div", { style: { fontSize: 10, color: prog && prog.phase === "error" ? T.err : T.textTertiary, marginTop: 3, textAlign: "center" } }, phaseLabel));
              } else {
                button = React.createElement(P.Button, { variant: "primary", size: "sm", disabled: busy, onClick: function () { installCodexPet(p.id); } }, zh("Install", "安装"));
              }
              return React.createElement("div", { key: p.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid " + T.borderL2 } },
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                  React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: p.installed ? 600 : 400 } }, label),
                  React.createElement("div", { style: { color: T.textTertiary, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: [p.category, p.author, p.license].filter(Boolean).join(" · ") },
                    [p.category, p.author, p.license].filter(Boolean).join(" · "))),
                button);
            })));
        }
      }
      children.push(React.createElement("div", { key: "online", ref: onlineRef, style: cardStyle }, catalogChildren));

      if (err) children.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12, marginBottom: 8 } }, err));

      return React.createElement("div", { style: { maxWidth: 720 } }, children);
    }

    // ---- Vision panel -----------------------------------------------------
    function useVision() {
      var state = React.useState(null);
      var setData = state[1];
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(withLang("/vision/status"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setData(d); })
            .catch(function () {});
        };
        load();
        return function () { disposed = true; };
      }, []);
      return [state[0], setData];
    }

    function VisionPanel() {
      var pair = useVision();
      var data = pair[0];
      var setData = pair[1];

      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];
      var errState = React.useState("");
      var err = errState[0];
      var setErr = errState[1];

      // Draft settings (endpoint / model / key env), editable + saved via /vision/config.
      var baseUrlState = React.useState("");
      var baseUrl = baseUrlState[0];
      var setBaseUrl = baseUrlState[1];
      var modelState = React.useState("");
      var model = modelState[0];
      var setModel = modelState[1];
      var keyEnvState = React.useState("");
      var keyEnv = keyEnvState[0];
      var setKeyEnv = keyEnvState[1];
      var modelsState = React.useState([]);
      var models = modelsState[0];
      var setModels = modelsState[1];

      // Provider catalog (vision-capable, OpenAI-compatible) + current pick.
      var providersState = React.useState([]);
      var providers = providersState[0];
      var setProviders = providersState[1];
      var selectedProviderState = React.useState("");
      var selectedProvider = selectedProviderState[0];
      var setSelectedProvider = selectedProviderState[1];

      var initialized = React.useRef(false);
      React.useEffect(function () {
        if (data && !initialized.current) {
          initialized.current = true;
          setBaseUrl(data.baseUrl || "");
          setModel(data.model || "");
          setKeyEnv(data.apiKeyEnv || "");
        }
      }, [data]);

      React.useEffect(function () {
        var disposed = false;
        fetch(withLang("/vision/providers"))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && !disposed) setProviders(d.providers || []); })
          .catch(function () {});
        return function () { disposed = true; };
      }, []);

      if (!data) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      var save = function () {
        setBusy(true);
        setErr("");
        fetch(withLang("/vision/config"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visionBaseUrl: baseUrl, visionModel: model, visionApiKeyEnv: keyEnv }),
        })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (x) { throw new Error(x && x.error ? x.error : "http " + r.status); }); })
          .then(function (d) { setData(d); setErr(zh("Saved", "已保存")); })
          .catch(function (x) { setErr(x && x.message ? x.message : String(x)); })
          .finally(function () { setBusy(false); });
      };

      var toggleVision = function () {
        setBusy(true);
        setErr("");
        fetch(withLang("/vision/config"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visionEnabled: !data.enabled }),
        })
          .then(function (r) { return r.ok ? r.json() : r.json().then(function (x) { throw new Error(x && x.error ? x.error : "http " + r.status); }); })
          .then(function (d) { setData(d); })
          .catch(function (x) { setErr(x && x.message ? x.message : String(x)); })
          .finally(function () { setBusy(false); });
      };

      var pickProvider = function (id) {
        setSelectedProvider(id);
        if (!id) return; // placeholder — keep the current values.
        var prov = providers.find(function (p) { return p.id === id; });
        if (!prov) return;
        setBaseUrl(prov.baseUrl || "");
        setModels(prov.models || []);
        setModel((prov.models && prov.models[0]) || "");
        setKeyEnv(prov.apiKeyEnv || "");
      };

      var children = [];

      // Settings: provider dropdown → model dropdown → key env → save.
      var providerOptions = providers.map(function (p) {
        return React.createElement("option", { key: p.id, value: p.id }, p.name);
      });

      var options = [];
      if (model && models.indexOf(model) < 0) options.push(model);
      models.forEach(function (m) { if (options.indexOf(m) < 0) options.push(m); });
      var optionEls = options.map(function (m) {
        return React.createElement("option", { key: m, value: m }, m);
      });

      var settingsChildren = [
        React.createElement("div", { key: "enable", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } },
          React.createElement("span", { style: { color: T.textTertiary, fontSize: 12 } }, zh("Vision", "视觉") + " · " + (data.enabled ? zh("Enabled", "已启用") : zh("Disabled", "未启用"))),
          React.createElement(P.Button, { variant: data.enabled ? "primary" : "outline", size: "sm", disabled: busy, onClick: toggleVision }, data.enabled ? zh("Disable", "关闭") : zh("Enable", "启用"))),
        React.createElement("div", { key: "t", style: titleStyle }, zh("Vision model", "视觉模型")),
        React.createElement("div", { key: "d", style: { color: T.textTertiary, fontSize: 12, marginBottom: 12 } },
          zh("Pick a provider, then a vision model — the endpoint and API key env are filled in for you.", "选择 provider 后会自动填入端点与 API key 变量，再选一个视觉模型。")),
        React.createElement("div", { key: "p", style: { marginBottom: 8 } },
          React.createElement("select", {
            value: selectedProvider,
            style: { width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid " + T.borderL2, background: "0 0", color: T.text, fontSize: 13 },
            onChange: function (e) { pickProvider(e.target.value); },
          },
            React.createElement("option", { value: "" }, providers.length === 0 ? zh("Loading providers…", "加载 provider 中…") : zh("Select provider…", "选择 provider…")),
            providerOptions)),
        React.createElement("div", { key: "m", style: { marginBottom: 8 } },
          React.createElement("select", {
            value: model,
            disabled: options.length === 0,
            style: { width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid " + T.borderL2, background: "0 0", color: T.text, fontSize: 13 },
            onChange: function (e) { setModel(e.target.value); },
          }, options.length === 0
            ? React.createElement("option", { value: "" }, zh("No models (pick a provider first)", "无模型（请先选择 provider）"))
            : optionEls)),
        React.createElement("div", { key: "k", style: { marginBottom: 8 } },
          React.createElement(P.Input, { value: keyEnv, placeholder: zh("API key env (auto from provider)", "API key 变量（随 provider 自动填入）"), style: { width: "100%" }, onChange: function (e) { setKeyEnv(e.target.value); setSelectedProvider(""); } })),
        React.createElement(P.Button, { key: "s", variant: "primary", size: "sm", disabled: busy, onClick: save }, zh("Save", "保存")),
      ];
      children.push(React.createElement("div", { key: "settings", style: cardStyle }, settingsChildren));

      // Status: reflects only what is saved server-side (updates after Save).
      var apiKeyMasked = data.apiKeyEnv
        ? String(data.apiKeyEnv).slice(0, 4) + "…"
        : zh("None", "无");
      children.push(React.createElement("div", { key: "status", style: cardStyle },
        React.createElement("div", { key: "t", style: titleStyle }, zh("Status", "状态")),
        Row({ key: "s1", label: zh("Enabled", "启用"), value: data.enabled ? zh("Yes", "是") : zh("No", "否") }),
        Row({ key: "s2", label: zh("Endpoint", "端点"), value: data.baseUrl }),
        Row({ key: "s3", label: zh("Model", "模型"), value: data.model }),
        Row({ key: "s4", label: zh("API key env", "API key 变量"), value: apiKeyMasked }),
        Row({ key: "s5", label: zh("Max tokens", "最大输出"), value: String(data.maxTokens) })));

      if (busy) children.push(React.createElement("div", { key: "busy", style: { color: T.textMuted, fontSize: 13, marginBottom: 8 } }, zh("Working…", "处理中…")));
      if (err) children.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12, marginBottom: 8, whiteSpace: "pre-wrap" } }, err));

      return React.createElement("div", { style: { maxWidth: 720 } }, children);
    }

    // ---- IM Bridge panel --------------------------------------------------
    var IM_UI = {
      en: {
        connected: "Connected", notConnected: "Not connected", disabled: "Disabled",
        enterToken: "Enter new token", tokenFrom: "Bot token from @BotFather",
        save: "Save", connect: "Connect", cancel: "Cancel",
        tokenConfigured: "Token configured", change: "Change", disconnect: "Disconnect",
        waitingScan: "Waiting for scan", scanHint: "Scan with WeChat to connect the AI bot",
        scanConnect: "Scan to connect", connecting: "Connecting...",
      },
      zh: {
        connected: "已连接", notConnected: "未连接", disabled: "未启用",
        enterToken: "输入新 token", tokenFrom: "Bot token 来自 @BotFather",
        save: "保存", connect: "连接", cancel: "取消",
        tokenConfigured: "已配置 token", change: "更改", disconnect: "断开",
        waitingScan: "等待扫码", scanHint: "用微信扫码连接 AI bot",
        scanConnect: "扫码连接", connecting: "正在连接中...",
      },
    };
    function imT(key) {
      return (IM_UI[uiLang] && IM_UI[uiLang][key]) || IM_UI.en[key] || key;
    }
    function imWithLang(url) {
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + "lang=" + encodeURIComponent(uiLang);
    }
    function Dot(color) {
      return React.createElement("span", {
        style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, verticalAlign: "middle" },
      });
    }
    var imGroupStyle = { marginBottom: 22 };
    var imTitleStyle = { fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8, color: T.text };
    var imRowStyle = { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 };
    var imMutedStyle = { fontSize: 12, color: T.textMuted };
    var imErrStyle = { fontSize: 12, color: T.err, marginBottom: 8, wordBreak: "break-word" };

    function useImStatus() {
      var statusState = React.useState(null);
      var setStatus = statusState[1];
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(imWithLang("/im/status"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setStatus(d); })
            .catch(function () {});
        };
        load();
        var timer = setInterval(load, 3000);
        return function () { disposed = true; clearInterval(timer); };
      }, []);
      return statusState[0];
    }

    function ImSettingsSection() {
      var status = useImStatus();
      var editingState = React.useState(false);
      var editing = editingState[0];
      var setEditing = editingState[1];
      var tokenState = React.useState("");
      var token = tokenState[0];
      var setToken = tokenState[1];
      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var post = function (url, body) {
        setBusy(true);
        return fetch(imWithLang(url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) { setStatus(d); setEditing(false); setToken(""); } })
          .catch(function (e) { console.error("[settings-pro:im]", e); })
          .finally(function () { setBusy(false); });
      };

      var telegram = status && status.telegram;
      var wechat = status && status.wechat;
      var configured = !!(telegram && telegram.tokenConfigured);
      var teleColor = telegram && telegram.connected ? T.ok : (telegram && telegram.enabled ? T.warn : T.textTertiary);
      var wxColor = wechat && wechat.loggedIn ? T.ok : (wechat && wechat.scanning ? T.warn : T.textTertiary);

      var teleStatus = telegram && telegram.enabled
        ? (telegram.connected ? imT("connected") : imT("notConnected")) + (telegram.bot ? " · @" + telegram.bot : "")
        : imT("disabled");

      var teleChildren = [
        React.createElement("div", { key: "t", style: imTitleStyle },
          Dot(teleColor), "Telegram",
          React.createElement("span", { style: imMutedStyle }, teleStatus)),
      ];

      if (!configured || editing) {
        teleChildren.push(
          React.createElement("div", { key: "in", style: imRowStyle },
            React.createElement(P.Input, {
              type: "password", autoComplete: "new-password", value: token, style: { flex: 1 },
              placeholder: editing ? imT("enterToken") : imT("tokenFrom"),
              onChange: function (e) { setToken(e.target.value); },
            }),
            React.createElement(P.Button, {
              variant: "primary", size: "sm", disabled: busy,
              onClick: function () { post("/im/telegram", { token: token }); },
            }, editing ? imT("save") : imT("connect"))),
          editing ? React.createElement(P.Button, {
            key: "cancel", variant: "ghost", size: "sm", disabled: busy,
            onClick: function () { setEditing(false); setToken(""); },
          }, imT("cancel")) : null);
      } else {
        teleChildren.push(
          React.createElement("div", { key: "cfg", style: imRowStyle },
            React.createElement("span", { style: imMutedStyle }, imT("tokenConfigured")),
            React.createElement(P.Button, { variant: "ghost", size: "sm", disabled: busy, onClick: function () { setEditing(true); setToken(""); } }, imT("change")),
            React.createElement(P.Button, { variant: "outline", size: "sm", disabled: busy, onClick: function () { post("/im/telegram", { token: "" }); } }, imT("disconnect"))));
      }
      if (telegram && telegram.error) teleChildren.push(React.createElement("div", { key: "err", style: imErrStyle }, telegram.error));

      var wxStatus = wechat && wechat.loggedIn
        ? imT("connected") + (wechat.userName ? " · " + wechat.userName : "")
        : wechat && wechat.scanning
          ? imT("waitingScan")
          : wechat && wechat.enabled ? imT("notConnected") : imT("disabled");

      var wxChildren = [
        React.createElement("div", { key: "t", style: imTitleStyle },
          Dot(wxColor), "WeChat",
          React.createElement("span", { style: imMutedStyle }, wxStatus)),
      ];

      if (wechat && wechat.scanning && wechat.qrcode) {
        wxChildren.push(React.createElement("div", { key: "qr", style: { textAlign: "center", margin: "4px 0 12px" } },
          React.createElement("img", {
            src: wechat.qrcode, alt: "WeChat QR",
            style: { width: 220, height: 220, borderRadius: 10, border: "1px solid " + T.borderL2 },
          }),
          React.createElement("div", { style: { marginTop: 8, fontSize: 12, color: T.textMuted } },
            imT("scanHint"))));
      }

      wxChildren.push(React.createElement("div", { key: "btn", style: imRowStyle },
        wechat && wechat.loggedIn
          ? React.createElement(P.Button, { variant: "outline", size: "sm", disabled: busy, onClick: function () { post("/im/wechat/logout"); } }, imT("disconnect"))
          : React.createElement(P.Button, { variant: "primary", size: "sm", disabled: busy, onClick: function () { post("/im/wechat/start"); } }, imT("scanConnect")),
        wechat && wechat.enabled && !wechat.loggedIn && !wechat.scanning
          ? React.createElement("span", { style: imMutedStyle }, imT("connecting")) : null));
      if (wechat && wechat.error) wxChildren.push(React.createElement("div", { key: "err", style: imErrStyle }, wechat.error));

      return React.createElement("div", null,
        React.createElement("div", { style: imGroupStyle }, teleChildren),
        React.createElement("div", null, wxChildren));
    }

    // ---- Placeholder panels ---------------------------------------------
    function Placeholder(props) {
      return React.createElement("div", { style: { color: T.textMuted, fontSize: 13, padding: "24px 0" } }, props.text);
    }

    // ---- Update badge & About panel --------------------------------------
    // `UpdateBadge` rides inside the settings-nav "Settings Pro" label and only
    // paints a "NEW" chip when a newer npm version exists (theme-adaptive, so it
    // works in dark mode too). `AboutPanel` is the "About" tab: plugin identity,
    // current/latest version, install mode, a manual "Check for updates" action,
    // and — only when an update actually exists — the "Update & Restart" button.
    function UpdateBadge() {
      var state = React.useState(null);
      var snap = state[0];
      var setSnap = state[1];
      React.useEffect(function () {
        fetch(withLang("/settings-pro/update"))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) setSnap(d); })
          .catch(function () {});
      }, []);
      if (!snap || snap.checkFailed || !snap.hasUpdate) return null;
      // Corner badge: absolutely pinned to the right edge of the nav label,
      // vertically centered. `right: 0` keeps the chip fully inside the
      // navLabel's overflow-hidden box (no negative inset, or the button
      // padding would clip it).
      return React.createElement("span", {
        style: {
          position: "absolute",
          top: "50%",
          right: 0,
          transform: "translateY(-50%)",
          padding: "0 5px",
          borderRadius: 999,
          fontSize: 10,
          lineHeight: "15px",
          fontWeight: 700,
          color: "var(--dsw-alias-bg-primary)",
          background: "var(--dsw-alias-state-warn-primary)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        },
      }, "NEW");
    }

    function AboutPanel() {
      var state = React.useState(null);
      var snap = state[0];
      var setSnap = state[1];
      var busyState = React.useState(false);
      var checking = busyState[0];
      var setChecking = busyState[1];
      var applyingState = React.useState(false);
      var applying = applyingState[0];
      var setApplying = applyingState[1];
      var errState = React.useState("");
      var actionErr = errState[0];
      var setActionErr = errState[1];

      function load(force) {
        setActionErr("");
        setChecking(true);
        fetch(withLang("/settings-pro/update" + (force ? "?force=1" : "")))
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d) setSnap(d); })
          .catch(function (e) { setActionErr(zh("Check failed: " + e.message, "检查失败：" + e.message)); })
          .finally(function () { setChecking(false); });
      }

      React.useEffect(function () { load(false); }, []);

      function apply() {
        setActionErr("");
        setApplying(true);
        fetch(withLang("/settings-pro/update/apply"), { method: "POST" })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (d) {
            if (!d || d.ok !== true) {
              setApplying(false);
              setActionErr(zh("Update failed: " + ((d && d.error) || "unknown error"), "更新失败：" + ((d && d.error) || "未知错误")));
            }
            // On success the process restarts; leave the busy state visible.
          })
          .catch(function (e) {
            setApplying(false);
            setActionErr(zh("Update failed: " + e.message, "更新失败：" + e.message));
          });
      }

      var hasUpdate = !!(snap && !snap.checkFailed && snap.hasUpdate);
      var isFile = !!(snap && snap.installMode === "file");
      var versionText = snap
        ? hasUpdate
          ? zh("v" + snap.current + " → v" + snap.latest, "v" + snap.current + " → v" + snap.latest)
          : "v" + (snap.current || "?")
        : "…";

      var rows = [
        { k: zh("Plugin", "插件"), v: "@kazecreator/dsh-settings-pro" },
        { k: zh("Version", "版本"), v: versionText },
      ];
      // The install mode only matters when it is not the default registry
      // install, so surface the row solely for a `file:` (local dev) link.
      if (isFile) {
        rows.push({ k: zh("Install", "安装方式"), v: zh("Local dev (file:)", "本地开发（file:）") });
      }

      var checkBtn = React.createElement(
        "button",
        {
          key: "check",
          style: {
            padding: "5px 12px", borderRadius: 6, border: "1px solid " + T.borderL2,
            background: "0 0", color: T.text, fontSize: 12, cursor: checking ? "default" : "pointer",
            font: "inherit",
          },
          disabled: checking,
          onClick: function () { load(true); },
        },
        checking ? zh("Checking…", "检查中…") : zh("Check for updates", "检查更新"),
      );

      var updateBtn = !hasUpdate || isFile || applying
        ? null
        : React.createElement(
            "button",
            {
              key: "update",
              style: {
                padding: "5px 12px", borderRadius: 6, border: "1px solid " + T.borderL2,
                background: T.text, color: "var(--dsw-alias-bg-primary)", fontSize: 12,
                fontWeight: 600, cursor: "pointer", font: "inherit",
              },
              onClick: apply,
            },
            zh("Update & Restart", "更新并重启"),
          );

      var actions = [checkBtn];
      if (updateBtn) actions.push(updateBtn);
      if (applying) actions.push(React.createElement("span", { key: "busy", style: imMutedStyle }, zh("Updating… restarting", "更新中…即将重启")));
      if (snap && !snap.checkFailed && !hasUpdate) {
        actions.push(React.createElement("span", { key: "uptodate", style: { fontSize: 12, color: T.textMuted } },
          zh("You are on the latest version.", "已是最新版本。")));
      }

      // Status line (error or "up to date") renders centered on its own row so
      // it reads cleanly below the action buttons.
      var statusLine = null;
      if (actionErr) {
        statusLine = React.createElement("div", { key: "err", style: { textAlign: "center", color: T.err, fontSize: 12, wordBreak: "break-word" } }, actionErr);
      }

      return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
        React.createElement("div", { style: cardStyle },
          rows.map(function (row) {
            return React.createElement("div", { key: row.k, style: rowStyle },
              React.createElement("span", { style: labelStyle }, row.k),
              React.createElement("span", { style: valueStyle }, row.v));
          })),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } }, actions),
        statusLine,
      );
    }

    function SettingsProSection() {
      var tabState = React.useState("usage");
      var active = tabState[0];
      var setActive = tabState[1];

      // Follow the DSH system language (fetched once, updated live) instead of
      // the browser language, so tab names switch with the locale setting.
      var langState = React.useState(uiLang);
      var lang = langState[0];
      var setLang = langState[1];
      React.useEffect(function () {
        uiLangListeners.push(setLang);
        return function () {
          var i = uiLangListeners.indexOf(setLang);
          if (i >= 0) uiLangListeners.splice(i, 1);
        };
      }, []);

      var tabs = BUILTIN_TABS.map(function (tab) {
        var component;
        if (tab.id === "usage") component = UsagePanel;
        else if (tab.id === "memory") component = MemoryPanel;
        else if (tab.id === "pets") component = PetsPanel;
        else if (tab.id === "vision") component = VisionPanel;
        else if (tab.id === "about") component = AboutPanel;
        else component = ImSettingsSection;
        return {
          id: tab.id,
          order: tab.order,
          label: lang === "zh" ? tab.zh : tab.en,
          component: component,
        };
      });
      tabs.sort(function (a, b) { return (a.order ?? 0) - (b.order ?? 0); });

      var activeTab = tabs.find(function (t) { return t.id === active; }) || tabs[0];

      var children = [
        React.createElement(
          "div",
          { key: "bar", style: tabBarStyle },
          tabs.map(function (tab) {
            var isActive = tab.id === activeTab.id;
            return React.createElement(
              "button",
              { key: tab.id, style: tabStyle(isActive), onClick: function () { setActive(tab.id); } },
              tab.label,
            );
          }),
        ),
        React.createElement(
          "div",
          { key: "panel", style: { minWidth: 0, paddingTop: 16 } },
          React.createElement(activeTab.component),
        ),
      ];

      return React.createElement(
        "div",
        { style: { maxWidth: 760, color: T.text, flexDirection: "column", gap: 12, display: "flex" } },
        children,
      );
    }

    // --- cordis client plugin ----------------------------------------------
    var inject = ["slots", "locale"];
    function apply(ctx) {
      // Adopt DSH's locale exactly (default + General settings changes) and keep
      // it in sync so the panel never disagrees with the host UI and switches
      // language live (no restart / re-open needed).
      var adoptLocale = function () {
        var snap = ctx.locale.getSnapshot();
        if (snap && snap.active) setUiLang(snap.active);
      };
      adoptLocale();
      ctx.effect(function () {
        var off = ctx.locale.subscribe(adoptLocale);
        return off;
      }, "settings-pro: locale");

      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "settings-pro",
            order: 20,
            label: function () {
              // The nav label renders `resolveSlotLabel(...)` directly as React
              // children, so a node works: a relative-positioned container that
              // fills the nav cell, with the label text and a NEW chip that only
              // appears when an npm update is actually available. The chip is
              // pinned to the right edge, vertically centered (dark-mode
              // adaptive via theme CSS variables).
              return React.createElement(
                "span",
                {
                  style: {
                    position: "relative",
                    display: "block",
                    width: "100%",
                    minWidth: 0,
                    paddingRight: 30,
                    boxSizing: "border-box",
                  },
                },
                uiLang === "zh" ? "设置 Pro" : "Settings Pro",
                React.createElement(UpdateBadge, null),
              );
            },
          },
          SettingsProSection,
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
