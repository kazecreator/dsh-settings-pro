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
      { id: "im-bridge", order: 100, zh: "IM Bridge", en: "IM Bridge" },
    ];

    function detectUiLang() {
      var lang =
        (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) ||
        (typeof navigator !== "undefined" && navigator.language) ||
        "en";
      return String(lang).toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
    }
    var uiLang = detectUiLang();
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
      React.useEffect(function () {
        var disposed = false;
        var load = function () {
          fetch(withLang("/settings-pro/usage"))
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && !disposed) setData(d); })
            .catch(function () {});
        };
        load();
        var timer = setInterval(load, 15000);
        return function () { disposed = true; clearInterval(timer); };
      }, []);
      return state[0];
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

    function fmtCost(n) {
      return "¥" + Number(n || 0).toFixed(4);
    }

    function UsagePanel() {
      var data = useUsage();
      if (!data) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      var balance = data.balance;
      var balanceInfos = balance && balance.balance_infos;
      var today = data.today;
      var total = today && today.total;

      var children = [];

      var balChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Balance", "余额"))];
      if (Array.isArray(balanceInfos) && balanceInfos.length > 0) {
        balanceInfos.forEach(function (b, i) {
          balChildren.push(Row({ key: "cur" + i, label: zh("Currency", "币种"), value: b.currency }));
          balChildren.push(Row({ key: "tot" + i, label: zh("Total", "总计"), value: b.total_balance }));
          balChildren.push(Row({ key: "grant" + i, label: zh("Granted", "赠送"), value: b.granted_balance }));
          balChildren.push(Row({ key: "top" + i, label: zh("Topped up", "充值"), value: b.topped_up_balance }));
        });
      } else if (data.balanceError) {
        balChildren.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12 } }, data.balanceError));
      } else {
        balChildren.push(React.createElement("div", { key: "none", style: { color: T.textMuted, fontSize: 12 } }, zh("Not configured", "未配置")));
      }
      children.push(React.createElement("div", { key: "bal", style: cardStyle }, balChildren));

      var todayChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Today", "今日用量") + (today && today.date ? " · " + today.date : ""))];
      if (total) {
        todayChildren.push(Row({ key: "in", label: zh("Input tokens", "输入 tokens"), value: String(total.inputTokens) }));
        todayChildren.push(Row({ key: "hit", label: zh("Cache hit", "命中缓存"), value: String(total.cacheReadTokens) }));
        todayChildren.push(Row({ key: "out", label: zh("Output tokens", "输出 tokens"), value: String(total.outputTokens) }));
        todayChildren.push(Row({ key: "cost", label: zh("Est. cost", "预估成本"), value: fmtCost(total.cost) }));
      } else {
        todayChildren.push(React.createElement("div", { key: "none", style: { color: T.textMuted, fontSize: 12 } }, zh("No usage yet today", "今日暂无用量")));
      }
      children.push(React.createElement("div", { key: "today", style: cardStyle }, todayChildren));

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

    var textareaStyle = {
      width: "100%",
      boxSizing: "border-box",
      background: "var(--dsw-alias-bg-layer-2)",
      color: T.text,
      border: "1px solid " + T.borderL2,
      borderRadius: 8,
      padding: "8px 10px",
      fontSize: 13,
      lineHeight: "20px",
      fontFamily: "inherit",
      resize: "vertical",
    };

    function MemoryPanel() {
      var pair = useMemory();
      var data = pair[0];
      var setData = pair[1];

      var editState = React.useState(false);
      var editing = editState[0];
      var setEditing = editState[1];
      var draftState = React.useState("");
      var draft = draftState[0];
      var setDraft = draftState[1];
      var noteState = React.useState("");
      var noteText = noteState[0];
      var setNoteText = noteState[1];

      if (!data) return React.createElement("div", { style: { color: T.textMuted, fontSize: 13 } }, zh("Loading…", "加载中…"));

      var summary = data.summary || "";
      var days = data.days || [];

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

      var saveSummary = function () {
        post("/settings-pro/memory/summary", { summary: draft }).then(function () { setEditing(false); });
      };

      var addNote = function () {
        if (noteText.trim() === "") return;
        post("/settings-pro/memory/note", { text: noteText }).then(function () { setNoteText(""); });
      };

      var exportMd = function () {
        var a = document.createElement("a");
        a.href = withLang("/settings-pro/memory/export.md");
        a.download = "memory-" + new Date().toISOString().slice(0, 10) + ".md";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };

      var children = [];

      // Summary card (view / edit).
      var sumChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Summary", "摘要"))];
      if (editing) {
        sumChildren.push(
          React.createElement("textarea", {
            key: "ta", value: draft, rows: 4, style: textareaStyle,
            onChange: function (e) { setDraft(e.target.value); },
          }),
          React.createElement("div", { key: "btns", style: { display: "flex", gap: 8, marginTop: 8 } },
            React.createElement(P.Button, { variant: "primary", size: "sm", onClick: saveSummary }, zh("Save", "保存")),
            React.createElement(P.Button, { variant: "ghost", size: "sm", onClick: function () { setEditing(false); } }, zh("Cancel", "取消"))));
      } else {
        sumChildren.push(
          React.createElement("div", { key: "s", style: { color: T.text, fontSize: 13, whiteSpace: "pre-wrap" } }, summary || zh("(empty)", "（空）")),
          React.createElement(P.Button, { key: "edit", variant: "ghost", size: "sm", style: { marginTop: 8 }, onClick: function () { setDraft(summary); setEditing(true); } }, zh("Edit", "编辑")));
      }
      children.push(React.createElement("div", { key: "sum", style: cardStyle }, sumChildren));

      // Notes grouped by date (newest day first).
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

      // Add note.
      children.push(React.createElement("div", { key: "add", style: cardStyle },
        React.createElement("div", { key: "t", style: titleStyle }, zh("Add note", "添加记录")),
        React.createElement("div", { key: "r", style: { display: "flex", gap: 8 } },
          React.createElement(P.Input, { value: noteText, placeholder: zh("New note…", "新记录…"), style: { flex: 1 }, onChange: function (e) { setNoteText(e.target.value); } }),
          React.createElement(P.Button, { variant: "primary", size: "sm", onClick: addNote }, zh("Add", "添加")))));

      // Actions.
      children.push(React.createElement("div", { key: "actions", style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        React.createElement(P.Button, { variant: "outline", size: "sm", onClick: exportMd }, zh("Export MD", "导出 MD")),
        React.createElement(P.Button, { variant: "outline", size: "sm", onClick: function () { post("/settings-pro/memory/clear"); } }, zh("Clear", "清空"))));

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
        return function () { disposed = true; clearInterval(timer); };
      }, []);
      return [state[0], setData];
    }

    function petStatusText(data) {
      if (!data.enabled) return zh("Paused", "已暂停");
      var jobs = (data.liveJobs || []).length;
      var goals = (data.activeGoals || []).length;
      if (jobs > 0) return zh("Working", "进行中") + " · " + jobs + " " + zh("job", "任务");
      if (goals > 0) return String(goals) + " " + zh("goal", "目标");
      return zh("Watching", "监控中") + " · " + (data.activeAgents ?? 0) + " " + zh("session", "会话");
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
        whiteSpace: "nowrap",
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
    var PET_STATE_LABELS = { idle: "空闲", working: "任务中", goal: "有目标", paused: "暂停" };

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

    function petThumb(pet, size) {
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

      var nameState = React.useState("");
      var name = nameState[0];
      var setName = nameState[1];
      var filesState = React.useState({});
      var files = filesState[0];
      var setFiles = filesState[1];
      var errState = React.useState("");
      var err = errState[0];
      var setErr = errState[1];

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

      var setFile = function (key) {
        return function (e) {
          var f = e.target.files && e.target.files[0];
          var next = { idle: files.idle, working: files.working, goal: files.goal, paused: files.paused };
          next[key] = f || undefined;
          setFiles(next);
        };
      };

      var addStep = function () {
        if (name.trim() === "") { setErr(zh("Enter a name first", "请先填写名称")); return; }
        if (!files.idle) { setErr(zh("idle image is required", "idle 状态图必填")); return; }
        var states = {};
        var pending = PET_STATES.map(function (k) {
          var f = files[k];
          if (!f) return Promise.resolve();
          return readAsDataUrl(f).then(function (url) { states[k] = { dataUrl: url }; });
        });
        Promise.all(pending).then(function () {
          return postList("/pets/add", { name: name, states: states });
        }).then(function () {
          setName(""); setFiles({}); setErr("");
        });
      };

      var onZip = function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        readAsDataUrl(f).then(function (url) {
          var b64 = String(url).replace(/^data:[^;]+;base64,/, "");
          return postList("/pets/add", { zip: b64 });
        });
        e.target.value = "";
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
            React.createElement("div", { style: { color: T.text, fontSize: 13, fontWeight: isActive ? 600 : 400 } }, p.name),
            React.createElement("div", { style: { color: T.textTertiary, fontSize: 11 } }, p.source === "builtin" ? zh("Built-in", "内置") : zh("Custom", "自定义"))),
          isActive
            ? React.createElement(P.Button, { variant: "outline", size: "sm", disabled: true }, zh("Active", "使用中"))
            : React.createElement(P.Button, { variant: "primary", size: "sm", disabled: busy, onClick: function () { select(p.id); } }, zh("Use", "使用")),
          p.source === "user"
            ? React.createElement(P.Button, { variant: "ghost", size: "sm", disabled: busy, onClick: function () { removePet(p.id); } }, zh("Delete", "删除"))
            : null));
      });
      children.push(React.createElement("div", { key: "catalog", style: cardStyle }, catChildren));

      // Add pet (step upload).
      var addChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Add pet", "添加宠物"))];
      addChildren.push(React.createElement("div", { key: "n", style: { display: "flex", gap: 8, marginBottom: 10 } },
        React.createElement(P.Input, { value: name, placeholder: zh("Pet name", "宠物名称"), style: { flex: 1 }, onChange: function (e) { setName(e.target.value); } })));
      PET_STATES.forEach(function (key) {
        addChildren.push(React.createElement("div", { key: key, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
          React.createElement("span", { style: { width: 64, color: T.textTertiary, fontSize: 12 } }, PET_STATE_LABELS[key] + (key === "idle" ? " *" : "")),
          React.createElement("input", { type: "file", accept: "image/gif,image/png,image/webp,image/jpeg", style: { flex: 1, color: T.textMuted, fontSize: 12 }, onChange: setFile(key) })));
      });
      addChildren.push(React.createElement("div", { key: "add", style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 } },
        React.createElement(P.Button, { variant: "primary", size: "sm", disabled: busy, onClick: addStep }, zh("Add", "添加")),
        React.createElement("span", { style: { color: T.textTertiary, fontSize: 11 } }, zh("or import a zip", "或导入 zip 包"))));
      children.push(React.createElement("div", { key: "addCard", style: cardStyle }, addChildren));

      // Zip import.
      children.push(React.createElement("div", { key: "zip", style: cardStyle },
        React.createElement("div", { key: "t", style: titleStyle }, zh("Import zip", "导入素材包（zip）")),
        React.createElement("div", { key: "d", style: { color: T.textMuted, fontSize: 12, marginBottom: 8 } },
          zh("A zip containing manifest.json + state images (idle required).", "zip 内含 manifest.json + 各状态图（idle 必填）。")),
        React.createElement("input", { key: "i", type: "file", accept: ".zip,application/zip", style: { color: T.textMuted, fontSize: 12 }, onChange: onZip })));

      if (err) children.push(React.createElement("div", { key: "err", style: { color: T.err, fontSize: 12, marginBottom: 8 } }, err));

      // Status.
      var jobs = data.liveJobs || [];
      var goals = data.activeGoals || [];
      children.push(React.createElement("div", { key: "status", style: cardStyle },
        Row({ key: "s1", label: zh("Status", "状态"), value: data.enabled ? zh("Enabled", "已开启") : zh("Disabled", "已关闭") }),
        Row({ key: "s2", label: zh("Active sessions", "活动会话"), value: String(data.activeAgents ?? 0) }),
        Row({ key: "s3", label: zh("Running jobs", "运行中任务"), value: String(jobs.length) }),
        Row({ key: "s4", label: zh("Active goals", "活动目标"), value: String(goals.length) })));

      var activity = data.recentActivity || [];
      if (activity.length > 0) {
        var actChildren = [React.createElement("div", { key: "t", style: titleStyle }, zh("Recent activity", "最近活动"))];
        activity.slice(0, 6).forEach(function (a, i) {
          var when = new Date(a.ts).toLocaleTimeString();
          actChildren.push(React.createElement("div", { key: i, style: { color: T.textMuted, fontSize: 12, marginBottom: 4 } },
            when + " · " + a.type + " · " + a.sessionId.slice(0, 8)));
        });
        children.push(React.createElement("div", { key: "act", style: cardStyle }, actChildren));
      }

      return React.createElement("div", { style: { maxWidth: 720 } }, children);
    }

    // ---- IM Bridge panel (merged from @kazecreator/dsh-im) ----------------
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
              type: "password", value: token, style: { flex: 1 },
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

    function SettingsProSection() {
      var tabState = React.useState("usage");
      var active = tabState[0];
      var setActive = tabState[1];

      var tabs = BUILTIN_TABS.map(function (tab) {
        var component;
        if (tab.id === "usage") component = UsagePanel;
        else if (tab.id === "memory") component = MemoryPanel;
        else if (tab.id === "pets") component = PetsPanel;
        else component = ImSettingsSection;
        return {
          id: tab.id,
          order: tab.order,
          label: uiLang === "zh" ? tab.zh : tab.en,
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
    var inject = ["slots"];
    function apply(ctx) {
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register(
          {
            name: "settings.section",
            id: "settings-pro",
            order: 20,
            label: function () {
              return uiLang === "zh" ? "设置 Pro" : "Settings Pro";
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
