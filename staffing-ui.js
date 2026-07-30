(function () {
  const bridge = () => window.__eosBridge;
  const api = (...args) => bridge().apiRequest(...args);
  const toast = (...args) => bridge().showToast(...args);
  const activate = (id) => bridge().activate(id);
  const getUser = () => bridge().getUser();

  const aiState = {
    requirementId: null,
    requirementStatus: null,
    matchRows: [],
    selectedIds: new Set(),
    targetHeadcount: null,
    parsedTags: [],
    loading: false
  };

  let adminSelectedId = null;
  let resumeDialogReturnFocus = null;
  let resumeParseLoading = false;

  const RESUME_PARSE_EXAMPLE =
    "演示候选人A，本科学历，现居北京，Java开发工程师，6年开发经验，熟悉Java、Spring Boot、MySQL和Redis，可在7天内到岗。";

  function displayField(value) {
    const v = String(value ?? "").trim();
    return v ? esc(v) : '<span class="muted">未提取</span>';
  }

  function setResumeParseStatus(kind, text) {
    const el = document.getElementById("resumeParseStatus");
    if (!el) return;
    el.className =
      kind === "error"
        ? "resume-parse-status status status-warn"
        : kind === "success"
          ? "resume-parse-status status status-success"
          : kind === "loading"
            ? "resume-parse-status status status-pending"
            : "resume-parse-status muted";
    el.textContent = text || "";
  }

  function renderResumeParseResult(data) {
    const result = document.getElementById("resumeParseResult");
    const fields = document.getElementById("resumeParseFields");
    const sourceEl = document.getElementById("resumeParseSource");
    const skillsWrap = document.getElementById("resumeParseSkillsWrap");
    const certsWrap = document.getElementById("resumeParseCertsWrap");
    const skillsEl = document.getElementById("resumeParseSkills");
    const certsEl = document.getElementById("resumeParseCerts");
    if (!result || !fields) return;

    const c = data?.candidate || {};
    const exp =
      c.yearsExperience != null && c.yearsExperience !== "" && Number(c.yearsExperience) >= 0
        ? `${c.yearsExperience} 年`
        : "";

    if (sourceEl) {
      sourceEl.textContent = data?.parseSourceLabel ? `来源：${data.parseSourceLabel}` : "";
    }

    fields.innerHTML = [
      ["姓名", c.name],
      ["目标岗位", c.jobTitle],
      ["城市", c.city],
      ["工作经验", exp],
      ["到岗时间", c.availableDate],
      ["用工形式", c.employmentType],
      ["薪资范围", c.salaryRange],
      ["学历", c.education],
      ["AI 摘要", c.summary]
    ]
      .map(
        ([label, val]) =>
          `<div class="resume-parse-dl-row"><dt>${esc(label)}</dt><dd>${displayField(val)}</dd></div>`
      )
      .join("");

    const skills = Array.isArray(c.skills) ? c.skills.filter(Boolean) : [];
    const certs = Array.isArray(c.certificates) ? c.certificates.filter(Boolean) : [];

    if (skillsWrap && skillsEl) {
      if (skills.length) {
        skillsWrap.hidden = false;
        skillsEl.innerHTML = skills.map((s) => `<span class="ai-tag">${esc(s)}</span>`).join("");
      } else {
        skillsWrap.hidden = false;
        skillsEl.innerHTML = '<span class="muted">未提取</span>';
      }
    }
    if (certsWrap && certsEl) {
      if (certs.length) {
        certsWrap.hidden = false;
        certsEl.innerHTML = certs.map((s) => `<span class="ai-tag">${esc(s)}</span>`).join("");
      } else {
        certsWrap.hidden = false;
        certsEl.innerHTML = '<span class="muted">未提取</span>';
      }
    }

    result.hidden = false;
  }

  function openResumeParseDialog() {
    const dialog = document.getElementById("resumeParseDialog");
    if (!(dialog instanceof HTMLDialogElement)) return;
    const active = document.activeElement;
    resumeDialogReturnFocus = active instanceof HTMLElement ? active : null;
    setResumeParseStatus("", "");
    dialog.showModal();
    document.getElementById("resumeParseInput")?.focus();
  }

  function closeResumeParseDialog() {
    const dialog = document.getElementById("resumeParseDialog");
    dialog?.close();
    const target = resumeDialogReturnFocus;
    resumeDialogReturnFocus = null;
    if (target instanceof HTMLElement && document.contains(target)) {
      requestAnimationFrame(() => target.focus());
    }
  }

  async function runResumeParse() {
    if (resumeParseLoading) return;
    const input = document.getElementById("resumeParseInput");
    const submitBtn = document.getElementById("resumeParseSubmit");
    const text = input?.value.trim() || "";
    if (!text) {
      setResumeParseStatus("error", "请先输入或填入合成简历文本");
      return;
    }

    resumeParseLoading = true;
    const label = submitBtn?.textContent;
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
      submitBtn.textContent = "解析中…";
    }
    document.getElementById("resumeParseResult")?.setAttribute("hidden", "");
    setResumeParseStatus("loading", "正在调用 AI 解析简历文本…");

    try {
      const data = await api("/api/ai/parse-resume", {
        method: "POST",
        body: JSON.stringify({ text })
      });
      const c = data?.candidate;
      const hasContent =
        c &&
        (c.name ||
          c.jobTitle ||
          c.city ||
          (c.skills && c.skills.length) ||
          c.summary ||
          c.education);
      if (!hasContent) {
        setResumeParseStatus("error", "未解析到有效字段，请调整文本后重试");
        return;
      }
      renderResumeParseResult(data);
      setResumeParseStatus("success", "解析完成，请人工核对后使用");
    } catch (err) {
      setResumeParseStatus("error", err?.message || "解析失败，请稍后重试");
    } finally {
      resumeParseLoading = false;
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = label || "开始 AI 解析";
      }
    }
  }

  function clearResumeParseForm() {
    const input = document.getElementById("resumeParseInput");
    if (input) input.value = "";
    document.getElementById("resumeParseResult")?.setAttribute("hidden", "");
    setResumeParseStatus("", "");
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusClass(status) {
    if (["已确认", "已转项目"].includes(status)) return "status-success";
    if (["待确认", "已推荐", "待匹配"].includes(status)) return "status-pending";
    if (status === "已关闭") return "status-warn";
    return "status-info";
  }

  function setAiStatus(kind, text) {
    const bar = document.getElementById("aiStatusBar");
    if (!bar) return;
    const cls =
      kind === "error"
        ? "status status-warn"
        : kind === "success"
          ? "status status-success"
          : kind === "loading"
            ? "status status-pending"
            : "muted";
    bar.innerHTML = `<span class="${cls}">${esc(text)}</span>`;
  }

  function renderParsedTags(tags, parseSourceLabel) {
    const panel = document.getElementById("aiParsedPanel");
    const wrap = document.getElementById("aiParsedTags");
    const sourceEl = document.getElementById("aiParseSource");
    if (!panel || !wrap) return;
    if (sourceEl) {
      if (parseSourceLabel) {
        sourceEl.hidden = false;
        sourceEl.textContent = `来源：${parseSourceLabel}`;
      } else {
        sourceEl.hidden = true;
        sourceEl.textContent = "";
      }
    }
    if (!tags?.length) {
      panel.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    panel.hidden = false;
    wrap.innerHTML = tags
      .map((t) => `<span class="ai-tag"><span class="ai-tag-label">${esc(t.label)}</span>${esc(t.value)}</span>`)
      .join("");
  }

  function updateWorkbenchActions() {
    const status = aiState.requirementStatus;
    const editable = !status || ["草稿", "已推荐"].includes(status);
    const submitBtn = document.getElementById("aiSubmitRequirement");
    const saveBtn = document.getElementById("aiSaveDraft");
    const matchBtn = document.getElementById("runAiMatch");
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = !editable;
      submitBtn.title = editable ? "" : "当前状态不可再次提交";
    }
    if (saveBtn instanceof HTMLButtonElement) {
      saveBtn.disabled = !editable;
    }
    if (matchBtn instanceof HTMLButtonElement) {
      matchBtn.disabled = status === "已转项目" || status === "已确认";
    }
    document.querySelectorAll(".ai-toggle-pick").forEach((btn) => {
      btn.disabled = !editable;
    });
  }

  function updateAdminActionButtons(status) {
    const rematch = document.getElementById("staffingDetailRematch");
    const confirm = document.getElementById("staffingDetailConfirm");
    const convert = document.getElementById("staffingDetailConvert");
    const setAction = (btn, show) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.classList.toggle("is-staffing-action-hidden", !show);
      btn.disabled = !show;
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    };
    setAction(rematch, !["已确认", "已转项目", "待确认"].includes(status));
    setAction(confirm, status === "待确认");
    setAction(convert, status === "已确认");
  }

  function updateSelectionUI() {
    const target = aiState.targetHeadcount ?? "—";
    const sel = aiState.selectedIds.size;
    ["aiSelectedCount", "aiSideSelected"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(sel);
    });
    ["aiTargetHeadcount", "aiSideTarget"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(target);
    });
    const list = document.getElementById("aiSelectedList");
    if (list) {
      const picked = aiState.matchRows.filter((r) => aiState.selectedIds.has(r.candidateId));
      list.innerHTML = picked.length
        ? picked
            .map(
              (r) =>
                `<li><span>${esc(r.name)}</span><span class="muted">${esc(r.jobTitle || "")}</span><button type="button" class="ghost-btn ai-remove-pick" data-id="${r.candidateId}" aria-label="移除">×</button></li>`
            )
            .join("")
        : `<li class="muted ai-side-empty">尚未选择候选人</li>`;
      list.querySelectorAll(".ai-remove-pick").forEach((btn) => {
        btn.addEventListener("click", () => {
          aiState.selectedIds.delete(Number(btn.dataset.id));
          updateSelectionUI();
          renderCandidateCards();
        });
      });
    }
    document.getElementById("aiSummaryStrip")?.toggleAttribute("hidden", !aiState.matchRows.length);
    updateWorkbenchActions();
  }

  function scoreBar(score) {
    const pct = Math.max(0, Math.min(100, Number(score) || 0));
    let tone = "low";
    if (pct >= 75) tone = "high";
    else if (pct >= 50) tone = "mid";
    return `<div class="ai-score-bar" aria-label="匹配度 ${pct} 分"><div class="ai-score-fill ai-score-${tone}" style="width:${pct}%"></div><span class="ai-score-text">${pct}</span></div>`;
  }

  function renderCandidateCards() {
    const wrap = document.getElementById("aiCandidateList");
    const empty = document.getElementById("aiEmptyBlock");
    const countEl = document.getElementById("aiMatchCount");
    if (!wrap) return;
    if (countEl) countEl.textContent = String(aiState.matchRows.length);

    if (!aiState.matchRows.length) {
      if (empty) empty.hidden = false;
      wrap.querySelectorAll(".ai-candidate-card").forEach((el) => el.remove());
      return;
    }
    if (empty) empty.hidden = true;
    wrap.querySelectorAll(".ai-candidate-card").forEach((el) => el.remove());

    aiState.matchRows.forEach((row) => {
      const selected = aiState.selectedIds.has(row.candidateId);
      const card = document.createElement("article");
      card.className = "ai-candidate-card";
      card.innerHTML = `
        <header class="ai-card-head">
          <div>
            <strong>${esc(row.name)}</strong>
            <span class="muted">${esc(row.city || "")} · ${esc(row.jobTitle || "")}</span>
          </div>
          ${scoreBar(row.score)}
        </header>
        <div class="ai-card-meta">
          <span>经验 ${esc(row.yearsExperience ?? "—")} 年</span>
          <span>到岗 ${esc(row.availableDate || "—")}</span>
          <span class="${row.isAvailable ? "status status-success" : "status status-warn"}">${row.isAvailable ? "可用" : "暂不可用"}</span>
        </div>
        <p class="ai-card-reason"><strong>匹配理由：</strong>${esc(row.matchReason || "—")}</p>
        ${
          row.unmetConditions?.length
            ? `<p class="ai-card-unmet"><strong>风险提示：</strong>${row.unmetConditions.map(esc).join("；")}</p>`
            : ""
        }
        <div class="ai-card-tags">${(row.skills || []).slice(0, 6).map((s) => `<span class="ai-skill-tag">${esc(s)}</span>`).join("")}</div>
        <footer class="ai-card-actions">
          <button type="button" class="ghost-btn ai-toggle-pick" data-id="${row.candidateId}">${selected ? "移出名单" : "加入候选名单"}</button>
        </footer>`;
      wrap.appendChild(card);
    });

    wrap.querySelectorAll(".ai-toggle-pick").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        if (aiState.selectedIds.has(id)) aiState.selectedIds.delete(id);
        else aiState.selectedIds.add(id);
        updateSelectionUI();
        renderCandidateCards();
      });
    });
  }

  async function runMatch() {
    const query = document.getElementById("aiQueryInput")?.value.trim();
    if (!query) {
      setAiStatus("error", "请输入需求描述后再匹配");
      return;
    }
    const btn = document.getElementById("runAiMatch");
    const label = btn?.textContent;
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "匹配中…";
    }
    aiState.loading = true;
    setAiStatus("loading", "正在解析需求并检索人才库…");
    try {
      const data = await api("/api/ai/match", { method: "POST", body: JSON.stringify({ query }) });
      aiState.matchRows = data.rows || [];
      aiState.parsedTags = data.parsedTags || data.requirement?.parsedTags || [];
      aiState.targetHeadcount = data.requirement?.headcount ?? null;
      aiState.selectedIds = new Set();
      renderParsedTags(aiState.parsedTags, data.parseSourceLabel);
      renderCandidateCards();
      updateSelectionUI();
      setAiStatus("success", data.summary || `匹配到 ${aiState.matchRows.length} 位候选人`);
    } catch (err) {
      aiState.matchRows = [];
      renderCandidateCards();
      setAiStatus("error", err.message || "匹配失败");
    } finally {
      aiState.loading = false;
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = label || "智能匹配";
      }
    }
  }

  async function patchSelectedCandidates(id) {
    if (!aiState.selectedIds.size) return;
    await api(`/api/staffing/requirements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ selectedCandidateIds: [...aiState.selectedIds] })
    });
  }

  async function ensureRequirementDraft() {
    const rawQuery = document.getElementById("aiQueryInput")?.value.trim();
    if (!rawQuery) throw new Error("请先输入用工需求");
    if (aiState.requirementId) {
      if (["草稿", "已推荐"].includes(aiState.requirementStatus || "草稿")) {
        await patchSelectedCandidates(aiState.requirementId);
      }
      return aiState.requirementId;
    }
    const data = await api("/api/staffing/requirements", {
      method: "POST",
      body: JSON.stringify({ rawQuery })
    });
    aiState.requirementId = data.row?.id;
    aiState.requirementStatus = data.row?.status || "草稿";
    return aiState.requirementId;
  }

  async function saveDraft() {
    const btn = document.getElementById("aiSaveDraft");
    const label = btn?.textContent;
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "保存中…";
    }
    try {
      const id = await ensureRequirementDraft();
      if (id && aiState.matchRows.length) {
        const matchData = await api(`/api/staffing/requirements/${id}/match`, { method: "POST" });
        aiState.requirementStatus = matchData.row?.status || "已推荐";
      }
      await patchSelectedCandidates(id);
      aiState.requirementStatus = aiState.requirementStatus || "草稿";
      toast("草稿已保存");
      setAiStatus("success", "需求已保存为草稿，可继续调整候选名单");
      window.loadEnterpriseRequirements?.();
    } catch (err) {
      toast(err.message, { variant: "error" });
      setAiStatus("error", err.message);
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = label || "保存草稿";
      }
    }
  }

  async function submitRequirement() {
    const btn = document.getElementById("aiSubmitRequirement");
    const label = btn?.textContent;
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = true;
      btn.textContent = "提交中…";
    }
    try {
      const id = await ensureRequirementDraft();
      if (!id) throw new Error("创建需求失败");
      if (aiState.matchRows.length && aiState.selectedIds.size === 0) {
        throw new Error("请至少选择一名候选人后再提交");
      }
      const matchData = await api(`/api/staffing/requirements/${id}/match`, { method: "POST" });
      aiState.requirementStatus = matchData.row?.status || "已推荐";
      await patchSelectedCandidates(id);
      const submitData = await api(`/api/staffing/requirements/${id}/submit`, { method: "POST" });
      aiState.requirementStatus = submitData.row?.status || "待确认";
      toast("用工需求已提交，等待管理员确认");
      setAiStatus("success", "已提交管理员，状态：待确认");
      const bar = document.getElementById("aiStatusBar");
      if (bar && aiState.requirementId) {
        bar.dataset.requirementId = String(aiState.requirementId);
        bar.dataset.requirementNo = submitData.row?.requirementNo || "";
      }
      window.loadEnterpriseRequirements?.();
      window.loadStaffingAdminList?.();
    } catch (err) {
      toast(err.message, { variant: "error" });
      setAiStatus("error", err.message);
    } finally {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = false;
        btn.textContent = label || "提交用工需求";
      }
    }
  }

  async function loadRequirementIntoWorkbench(id) {
    try {
      const data = await api(`/api/staffing/requirements/${id}`);
      const row = data.row;
      aiState.requirementId = row.id;
      aiState.requirementStatus = row.status;
      aiState.targetHeadcount = row.headcount;
      aiState.parsedTags = row.parsedJson?.parsedTags || [];
      aiState.matchRows = (data.candidates || []).map((c) => ({
        candidateId: c.candidateId,
        name: c.name,
        city: c.city,
        jobTitle: c.jobTitle,
        yearsExperience: c.yearsExperience,
        skills: c.skills,
        certificates: c.certificates,
        availableDate: c.availableDate,
        score: c.score,
        matchReason: c.matchReason,
        unmetConditions: c.unmetConditions,
        isAvailable: c.isAvailable
      }));
      aiState.selectedIds = new Set(data.selectedCandidateIds || []);
      const input = document.getElementById("aiQueryInput");
      if (input) input.value = row.rawQuery || "";
      renderParsedTags(aiState.parsedTags);
      renderCandidateCards();
      updateSelectionUI();
      setAiStatus("success", `已加载需求 ${row.requirementNo}（${row.status}）`);
      activate("ai-assistant");
    } catch (err) {
      toast(err.message, { variant: "error" });
    }
  }

  async function loadEnterpriseRequirements() {
    const tbody = document.getElementById("entRequirementRows");
    const shell = document.getElementById("entReqTableShell");
    if (!tbody) return;
    try {
      const data = await api("/api/staffing/requirements");
      const rows = data.rows || [];
      const active = rows.filter((r) => !["已转项目", "已关闭"].includes(r.status)).length;
      const pending = rows.filter((r) => r.status === "待确认").length;
      const done = rows.filter((r) => r.status === "已转项目").length;
      document.getElementById("entReqActiveCount")?.replaceChildren(document.createTextNode(String(active)));
      document.getElementById("entReqPendingCount")?.replaceChildren(document.createTextNode(String(pending)));
      document.getElementById("entReqDoneCount")?.replaceChildren(document.createTextNode(String(done)));

      tbody.innerHTML = rows
        .map(
          (r) =>
            `<tr tabindex="0" data-req-id="${r.id}"><td>${esc(r.requirementNo)}</td><td>${esc(r.jobTitle || "—")}</td><td>${esc(r.city || "—")}</td><td>${esc(r.headcount ?? "—")}</td><td><span class="status ${statusClass(r.status)}">${esc(r.status)}</span></td><td>${esc(r.updatedAt || r.createdAt || "—")}</td><td><button type="button" class="tiny-btn ent-open-req" data-id="${r.id}">查看</button></td></tr>`
        )
        .join("");
      shell?.classList.toggle("is-empty", rows.length === 0);
      tbody.querySelectorAll(".ent-open-req").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          loadRequirementIntoWorkbench(Number(btn.dataset.id));
        });
      });
      tbody.querySelectorAll("tr[data-req-id]").forEach((tr) => {
        tr.addEventListener("click", () => loadRequirementIntoWorkbench(Number(tr.dataset.reqId)));
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") loadRequirementIntoWorkbench(Number(tr.dataset.reqId));
        });
      });
    } catch (err) {
      toast(err.message, { variant: "error" });
    }
  }

  function renderStaffingDetail(data) {
    const aside = document.getElementById("staffingAdminDetail");
    if (!aside || !data?.row) return;
    aside.hidden = false;
    const row = data.row;
    document.getElementById("staffingDetailTitle").textContent = `${row.requirementNo} · ${row.companyName || "—"}`;
    document.getElementById("staffingDetailRaw").textContent = row.rawQuery || "";
    const tags = row.parsedJson?.parsedTags || [];
    document.getElementById("staffingDetailTags").innerHTML = tags
      .map((t) => `<span class="ai-tag"><span class="ai-tag-label">${esc(t.label)}</span>${esc(t.value)}</span>`)
      .join("");
    document.getElementById("staffingDetailTimeline").innerHTML = (data.events || [])
      .map((e) => `<div class="staffing-event"><time>${esc(e.createdAt)}</time><strong>${esc(e.eventType)}</strong><span>${esc(e.detail || "")}</span></div>`)
      .join("");
    const cbody = document.getElementById("staffingDetailCandidates");
    cbody.innerHTML = (data.candidates || [])
      .slice(0, 20)
      .map(
        (c) =>
          `<tr><td>${esc(c.name)}</td><td>${esc(c.jobTitle || "")}</td><td>${esc(c.score ?? "—")}</td><td>${c.isAvailable ? "是" : "否"}</td></tr>`
      )
      .join("");
    updateAdminActionButtons(row.status);
  }

  async function loadStaffingAdminDetail(id) {
    adminSelectedId = id;
    try {
      const data = await api(`/api/staffing/requirements/${id}`);
      renderStaffingDetail(data);
      document.querySelectorAll("#staffingAdminRows tr").forEach((tr) => {
        tr.classList.toggle("is-selected", Number(tr.dataset.reqId) === id);
      });
    } catch (err) {
      toast(err.message, { variant: "error" });
    }
  }

  async function loadStaffingAdminList() {
    const tbody = document.getElementById("staffingAdminRows");
    const shell = tbody?.closest(".table-shell");
    if (!tbody) return;
    const status = document.getElementById("staffingStatusFilter")?.value || "";
    const hint = document.getElementById("staffingAdminQueryHint");
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : "";
      const data = await api(`/api/staffing/requirements${qs}`);
      const rows = data.rows || [];
      if (hint) hint.textContent = rows.length ? `共 ${rows.length} 条需求` : "暂无符合条件的需求";
      tbody.innerHTML = rows
        .map(
          (r) =>
            `<tr tabindex="0" data-req-id="${r.id}"><td>${esc(r.requirementNo)}</td><td>${esc(r.companyName || "—")}</td><td>${esc(r.jobTitle || "—")}</td><td>${esc(r.city || "—")}</td><td>${esc(r.headcount ?? "—")}</td><td><span class="status ${statusClass(r.status)}">${esc(r.status)}</span></td></tr>`
        )
        .join("");
      shell?.classList.toggle("is-empty", rows.length === 0);
      tbody.querySelectorAll("tr[data-req-id]").forEach((tr) => {
        const open = () => loadStaffingAdminDetail(Number(tr.dataset.reqId));
        tr.addEventListener("click", open);
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter") open();
        });
      });
      if (adminSelectedId) loadStaffingAdminDetail(adminSelectedId);
    } catch (err) {
      toast(err.message, { variant: "error" });
    }
  }

  function bindStaffingEvents() {
    document.getElementById("runAiMatch")?.addEventListener("click", runMatch);
    document.getElementById("aiSaveDraft")?.addEventListener("click", saveDraft);
    document.getElementById("aiSubmitRequirement")?.addEventListener("click", submitRequirement);
    document.getElementById("aiQueryInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runMatch();
    });
    document.querySelectorAll("#aiExampleChips .ai-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById("aiQueryInput");
        if (input) input.value = btn.dataset.aiExample || "";
        runMatch();
      });
    });

    document.getElementById("openResumeParseDialog")?.addEventListener("click", openResumeParseDialog);
    document.getElementById("resumeParseClose")?.addEventListener("click", closeResumeParseDialog);
    document.getElementById("resumeParseFillExample")?.addEventListener("click", () => {
      const input = document.getElementById("resumeParseInput");
      if (input) input.value = RESUME_PARSE_EXAMPLE;
      setResumeParseStatus("", "");
    });
    document.getElementById("resumeParseClear")?.addEventListener("click", clearResumeParseForm);
    document.getElementById("resumeParseSubmit")?.addEventListener("click", runResumeParse);
    document.getElementById("resumeParseDialog")?.addEventListener("close", () => {
      resumeParseLoading = false;
      const submitBtn = document.getElementById("resumeParseSubmit");
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
        submitBtn.textContent = "开始 AI 解析";
      }
    });
    document.getElementById("resumeParseDialog")?.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeResumeParseDialog();
    });

    document.addEventListener("click", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.id === "entRefreshRequirements") {
        loadEnterpriseRequirements();
        return;
      }
      if (t.id === "staffingAdminQuery") {
        loadStaffingAdminList();
        return;
      }
      if (t.id === "staffingDetailRematch") {
        if (!adminSelectedId) return;
        try {
          await api(`/api/staffing/requirements/${adminSelectedId}/match`, { method: "POST" });
          toast("已重新匹配");
          await loadStaffingAdminDetail(adminSelectedId);
          loadStaffingAdminList();
        } catch (err) {
          toast(err.message, { variant: "error" });
        }
        return;
      }
      if (t.id === "staffingDetailConfirm") {
        if (!adminSelectedId) return;
        try {
          await api(`/api/staffing/requirements/${adminSelectedId}/confirm`, { method: "POST" });
          toast("需求已确认");
          await loadStaffingAdminDetail(adminSelectedId);
          loadStaffingAdminList();
        } catch (err) {
          toast(err.message, { variant: "error" });
        }
        return;
      }
      if (t.id === "staffingDetailConvert") {
        if (!adminSelectedId) return;
        try {
          const data = await api(`/api/staffing/requirements/${adminSelectedId}/convert-project`, { method: "POST" });
          toast(`已转项目 ${data.projectCode}，审批 ${data.approvalNo}`);
          await loadStaffingAdminDetail(adminSelectedId);
          loadStaffingAdminList();
        } catch (err) {
          toast(err.message, { variant: "error" });
        }
        return;
      }
      if (t.id === "aiGeneratePlan") {
        toast("用工方案导出为演示能力，待甲方确认后接入", { variant: "info" });
        return;
      }
      if (t.classList.contains("quick-btn") && t.dataset.jump) {
        activate(t.dataset.jump);
      }
    });
  }

  window.loadEnterpriseRequirements = loadEnterpriseRequirements;
  window.loadStaffingAdminList = loadStaffingAdminList;
  window.refreshStaffingPanels = () => {
    const role = getUser()?.role;
    if (role === "enterprise") loadEnterpriseRequirements();
    if (role === "admin") loadStaffingAdminList();
  };

  bindStaffingEvents();

  if (localStorage.getItem("eos_token")) {
    setTimeout(() => window.refreshStaffingPanels?.(), 0);
  }
})();
