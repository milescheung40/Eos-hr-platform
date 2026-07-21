const { parseRequirementWithFallback } = require("./ai/parseService");
const {
  matchCandidates,
  enrichParsedTags,
  parseRequirement,
  maskSensitiveCandidate,
  parseJsonList
} = require("./staffingMatch");
const {
  resolveCompanyId,
  validateSelectedCandidates,
  assertCanSubmit,
  assertCanConfirm,
  assertCanConvert
} = require("./staffingValidation");

const REQUIREMENT_STATUSES = ["草稿", "待匹配", "已推荐", "待确认", "已确认", "已转项目", "已关闭"];

function nextRequirementNo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `SR${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

function rowToRequirement(row) {
  if (!row) return null;
  return {
    id: row.id,
    requirementNo: row.requirement_no,
    companyId: row.company_id,
    companyName: row.company_name,
    rawQuery: row.raw_query,
    jobTitle: row.job_title,
    city: row.city,
    headcount: row.headcount,
    minExperience: row.min_experience,
    requiredSkills: parseJsonList(row.required_skills),
    requiredCertificates: parseJsonList(row.required_certificates),
    availableBefore: row.available_before,
    employmentType: row.employment_type,
    budgetRange: row.budget_range,
    status: row.status,
    parsedJson: safeJsonParse(row.parsed_json, {}),
    selectedCandidateIds: parseJsonList(row.selected_candidate_ids),
    convertedProjectId: row.converted_project_id || null,
    convertedApprovalId: row.converted_approval_id || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sendError(res, err, fallback = 500) {
  const status = err.status || fallback;
  return res.status(status).json({ message: err.message || "操作失败" });
}

async function loadTalentCandidates(all) {
  return all(
    `SELECT id, name, id_no AS idNo, mobile, gender, status, hire_date AS hireDate, city, social_city AS socialCity,
            employment_type AS employmentType, job_title AS jobTitle, years_experience AS yearsExperience,
            skills, certificates, available_date AS availableDate, availability_status AS availabilityStatus,
            preferred_city AS preferredCity, salary_range AS salaryRange, project_experience AS projectExperience,
            is_talent_pool AS isTalentPool
     FROM employees WHERE is_talent_pool = 1 AND status IN ('在职','试用期','待入职')`
  );
}

function formatCandidateForApi(c, matchMeta, isAdmin) {
  const skills = parseJsonList(c.skills);
  const certificates = parseJsonList(c.certificates);
  const base = maskSensitiveCandidate(
    {
      candidateId: c.id,
      name: c.name,
      city: c.preferredCity || c.city,
      jobTitle: c.jobTitle,
      yearsExperience: c.yearsExperience,
      skills,
      certificates,
      availableDate: c.availableDate,
      availabilityStatus: c.availabilityStatus,
      employmentType: c.employmentType,
      salaryRange: c.salaryRange,
      projectExperience: c.projectExperience,
      mobile: c.mobile,
      idNo: c.idNo
    },
    isAdmin
  );
  return {
    ...base,
    score: matchMeta?.score ?? null,
    matchReason: matchMeta?.explanation ?? "",
    unmetConditions: matchMeta?.misses ?? [],
    isAvailable: (c.availabilityStatus || "可用") === "可用"
  };
}

async function appendRequirementEvent(run, requirementId, eventType, detail, username) {
  await run(
    "INSERT INTO staffing_requirement_events (requirement_id, event_type, detail, created_by) VALUES (?, ?, ?, ?)",
    [requirementId, eventType, detail, username || "system"]
  );
}

async function getRequirementById(get, id) {
  return get("SELECT * FROM staffing_requirements WHERE id = ?", [id]);
}

async function assertRequirementAccess(get, req, res, requirementId) {
  const row = await getRequirementById(get, requirementId);
  if (!row) {
    res.status(404).json({ message: "需求不存在" });
    return null;
  }
  if (req.user.role === "enterprise") {
    const companyId = await resolveCompanyId(get, req.user);
    if (!companyId || Number(row.company_id) !== companyId) {
      res.status(403).json({ message: "无权访问该需求" });
      return null;
    }
  }
  return row;
}

async function applySelectedCandidates(run, requirementId, selectedIds) {
  await run("UPDATE staffing_requirement_candidates SET is_selected = 0 WHERE requirement_id = ?", [requirementId]);
  for (const empId of selectedIds) {
    await run(
      "UPDATE staffing_requirement_candidates SET is_selected = 1 WHERE requirement_id = ? AND employee_id = ?",
      [requirementId, empId]
    );
  }
}

function registerStaffingRoutes(app, ctx) {
  const { run, get, all, audit, clampStr, auth, withTransaction } = ctx;
  const vctx = { get, all, run };

  app.post("/api/ai/match", auth(), async (req, res) => {
    const query = clampStr(req.body?.query || "", 500);
    if (!query) return res.status(400).json({ message: "请输入需求描述" });
    const candidates = await loadTalentCandidates(all);
    const { data: requirement, parseSource, parseSourceLabel } = await parseRequirementWithFallback(query);
    const { matches } = matchCandidates(query, candidates, 30, requirement);
    const isAdmin = req.user.role === "admin";
    const rows = matches.map(({ candidate, score, explanation, misses }) =>
      formatCandidateForApi(candidate, { score, explanation, misses }, isAdmin)
    );
    await audit(req.user, "ai_match", `source=${parseSource} hits=${rows.length}`);
    return res.json({
      summary: `已解析需求，匹配到 ${rows.length} 位候选人`,
      requirement,
      parsedTags: requirement.parsedTags,
      parseSource,
      parseSourceLabel,
      rows
    });
  });

  app.get("/api/staffing/requirements", auth(), async (req, res) => {
    const status = clampStr(req.query.status || "", 20);
    const where = [];
    const params = [];
    if (req.user.role === "enterprise") {
      const companyId = await resolveCompanyId(get, req.user);
      if (!companyId) return res.status(403).json({ message: "企业账号未绑定 company_id" });
      where.push("company_id = ?");
      params.push(companyId);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await all(
      `SELECT * FROM staffing_requirements ${whereSql} ORDER BY id DESC LIMIT 100`,
      params
    );
    res.json({ rows: rows.map(rowToRequirement) });
  });

  app.get("/api/enterprise/projects", auth(), async (req, res) => {
    if (req.user.role !== "enterprise") {
      return res.status(403).json({ message: "无权限访问" });
    }
    const companyId = await resolveCompanyId(get, req.user);
    if (!companyId) return res.status(403).json({ message: "企业账号未绑定 company_id" });
    const rows = await all(
      `SELECT p.id, p.name, p.code, p.client_company AS clientCompany, p.manager, p.status,
              p.start_date AS startDate, p.end_date AS endDate, sr.requirement_no AS requirementNo
       FROM staffing_requirements sr
       JOIN projects p ON p.id = sr.converted_project_id
       WHERE sr.company_id = ? AND sr.converted_project_id IS NOT NULL
       ORDER BY sr.id DESC`,
      [companyId]
    );
    res.json({ rows });
  });

  app.post("/api/staffing/requirements", auth(), async (req, res) => {
    const b = req.body || {};
    const rawQuery = clampStr(b.rawQuery, 500);
    if (!rawQuery) return res.status(400).json({ message: "请填写用工需求描述" });

    let companyId = b.companyId ? Number(b.companyId) : null;
    let companyName = clampStr(b.companyName, 80);
    if (req.user.role === "enterprise") {
      companyId = await resolveCompanyId(get, req.user);
      if (!companyId) return res.status(403).json({ message: "企业账号未绑定 company_id" });
      const co = await get("SELECT name FROM companies WHERE id = ?", [companyId]);
      companyName = co?.name || req.user.companyName || "演示企业客户";
    } else if (!companyName) {
      companyName = "演示企业客户";
    }

    const parsed = enrichParsedTags(parseRequirement(rawQuery));
    const status = req.user.role === "enterprise" ? "草稿" : clampStr(b.status || "草稿", 20);
    if (!REQUIREMENT_STATUSES.includes(status)) return res.status(400).json({ message: "状态非法" });

    let selectedIds = Array.isArray(b.selectedCandidateIds) ? b.selectedCandidateIds.map(Number) : [];
    if (selectedIds.length) {
      return res.status(400).json({ message: "请先保存需求并完成匹配后再选择候选人" });
    }

    await run(
      `INSERT INTO staffing_requirements
       (requirement_no, company_id, company_name, raw_query, job_title, city, headcount, min_experience,
        required_skills, required_certificates, available_before, employment_type, budget_range, status,
        parsed_json, selected_candidate_ids, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nextRequirementNo(),
        companyId,
        companyName,
        rawQuery,
        parsed.jobTitle,
        parsed.city,
        parsed.headcount,
        parsed.minExperience,
        JSON.stringify(parsed.requiredSkills || []),
        JSON.stringify(parsed.requiredCertificates || []),
        parsed.availableBefore,
        parsed.employmentType,
        parsed.budgetRange,
        status,
        JSON.stringify(parsed),
        JSON.stringify([]),
        req.user.username
      ]
    );
    const row = await get("SELECT * FROM staffing_requirements WHERE id = last_insert_rowid()");
    await appendRequirementEvent(run, row.id, "创建需求", `状态：${row.status}`, req.user.username);
    await audit(req.user, "staffing_requirement_create", `id=${row.id}`);
    res.status(201).json({ row: rowToRequirement(row) });
  });

  app.get("/api/staffing/requirements/:id", auth(), async (req, res) => {
    const id = Number(req.params.id);
    const row = await assertRequirementAccess(get, req, res, id);
    if (!row) return;
    const candidates = await all(
      `SELECT c.*, rc.match_score AS matchScore, rc.match_reason AS matchReason, rc.unmet_conditions AS unmetConditions, rc.is_selected AS isSelected
       FROM staffing_requirement_candidates rc
       JOIN employees c ON c.id = rc.employee_id
       WHERE rc.requirement_id = ?
       ORDER BY rc.match_score DESC`,
      [id]
    );
    const events = await all(
      "SELECT id, event_type AS eventType, detail, created_by AS createdBy, created_at AS createdAt FROM staffing_requirement_events WHERE requirement_id = ? ORDER BY id ASC",
      [id]
    );
    const isAdmin = req.user.role === "admin";
    res.json({
      row: rowToRequirement(row),
      candidates: candidates.map((c) =>
        formatCandidateForApi(
          {
            id: c.id,
            name: c.name,
            idNo: c.id_no,
            mobile: c.mobile,
            jobTitle: c.job_title,
            yearsExperience: c.years_experience,
            skills: c.skills,
            certificates: c.certificates,
            availableDate: c.available_date,
            availabilityStatus: c.availability_status,
            preferredCity: c.preferred_city,
            city: c.city,
            employmentType: c.employment_type,
            salaryRange: c.salary_range,
            projectExperience: c.project_experience
          },
          {
            score: c.matchScore,
            explanation: c.matchReason,
            misses: parseJsonList(c.unmetConditions)
          },
          isAdmin
        )
      ),
      events,
      selectedCandidateIds: parseJsonList(row.selected_candidate_ids)
    });
  });

  app.post("/api/staffing/requirements/:id/match", auth(), async (req, res) => {
    const id = Number(req.params.id);
    const row = await assertRequirementAccess(get, req, res, id);
    if (!row) return;
    if (["已确认", "已转项目"].includes(row.status)) {
      return res.status(409).json({ message: `当前状态「${row.status}」不可重新匹配` });
    }
    const candidates = await loadTalentCandidates(all);
    const { requirement, matches } = matchCandidates(row.raw_query, candidates, 30);
    await run(
      `UPDATE staffing_requirements SET job_title=?, city=?, headcount=?, min_experience=?, required_skills=?,
       required_certificates=?, available_before=?, employment_type=?, budget_range=?, parsed_json=?, status=?, updated_at=datetime('now','localtime')
       WHERE id=?`,
      [
        requirement.jobTitle,
        requirement.city,
        requirement.headcount,
        requirement.minExperience,
        JSON.stringify(requirement.requiredSkills || []),
        JSON.stringify(requirement.requiredCertificates || []),
        requirement.availableBefore,
        requirement.employmentType,
        requirement.budgetRange,
        JSON.stringify(requirement),
        "已推荐",
        id
      ]
    );
    await run("DELETE FROM staffing_requirement_candidates WHERE requirement_id = ?", [id]);
    for (const m of matches) {
      await run(
        `INSERT INTO staffing_requirement_candidates (requirement_id, employee_id, match_score, match_reason, unmet_conditions, is_selected)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [id, m.candidate.id, m.score, m.explanation, JSON.stringify(m.misses || [])]
      );
    }
    await appendRequirementEvent(run, id, "智能匹配", `推荐 ${matches.length} 人`, req.user.username);
    await audit(req.user, "staffing_requirement_match", `id=${id} hits=${matches.length}`);
    const updated = await getRequirementById(get, id);
    res.json({ row: rowToRequirement(updated), matchCount: matches.length, parsedTags: requirement.parsedTags });
  });

  app.patch("/api/staffing/requirements/:id", auth(), async (req, res) => {
    const id = Number(req.params.id);
    const row = await assertRequirementAccess(get, req, res, id);
    if (!row) return;
    const b = req.body || {};
    if (b.status !== undefined && b.status !== null && String(b.status).trim() !== "") {
      return res.status(400).json({
        message: "状态不可通过 PATCH 修改，请使用 submit / confirm / convert-project 接口"
      });
    }
    const selected = Array.isArray(b.selectedCandidateIds) ? b.selectedCandidateIds.map(Number) : null;

    if (req.user.role === "enterprise") {
      if (!["草稿", "已推荐"].includes(row.status)) {
        return res.status(409).json({ message: `当前状态「${row.status}」不可修改候选名单` });
      }
    }

    if (selected) {
      const validation = await validateSelectedCandidates(vctx, id, selected, { headcount: row.headcount });
      if (!validation.ok) return res.status(validation.status).json({ message: validation.message });
      await run(
        `UPDATE staffing_requirements SET selected_candidate_ids=?, updated_at=datetime('now','localtime') WHERE id=?`,
        [JSON.stringify(validation.ids), id]
      );
      await applySelectedCandidates(run, id, validation.ids);
    }

    const updated = await getRequirementById(get, id);
    res.json({ row: rowToRequirement(updated) });
  });

  app.post("/api/staffing/requirements/:id/submit", auth(), async (req, res) => {
    const id = Number(req.params.id);
    const row = await assertRequirementAccess(get, req, res, id);
    if (!row) return;
    try {
      assertCanSubmit(row.status);
    } catch (err) {
      return sendError(res, err, 409);
    }

    const selected = parseJsonList(row.selected_candidate_ids);
    const validation = await validateSelectedCandidates(vctx, id, selected, { headcount: row.headcount });
    if (!validation.ok) return res.status(validation.status).json({ message: validation.message });

    const matchCount = await get(
      "SELECT COUNT(*) AS c FROM staffing_requirement_candidates WHERE requirement_id = ?",
      [id]
    );
    if (!matchCount?.c) {
      return res.status(409).json({ message: "请先完成智能匹配后再提交" });
    }

    await run("UPDATE staffing_requirements SET status='待确认', updated_at=datetime('now','localtime') WHERE id=?", [id]);
    await appendRequirementEvent(run, id, "提交需求", "企业提交，等待管理员确认", req.user.username);
    await audit(req.user, "staffing_requirement_submit", `id=${id}`);
    const updated = await getRequirementById(get, id);
    res.json({ row: rowToRequirement(updated) });
  });

  app.post("/api/staffing/requirements/:id/confirm", auth("admin"), async (req, res) => {
    const id = Number(req.params.id);
    const row = await getRequirementById(get, id);
    if (!row) return res.status(404).json({ message: "需求不存在" });
    try {
      assertCanConfirm(row.status);
    } catch (err) {
      return sendError(res, err, 409);
    }
    await run("UPDATE staffing_requirements SET status='已确认', updated_at=datetime('now','localtime') WHERE id=?", [id]);
    await appendRequirementEvent(run, id, "管理员确认", "需求已确认", req.user.username);
    await audit(req.user, "staffing_requirement_confirm", `id=${id}`);
    const updated = await getRequirementById(get, id);
    res.json({ row: rowToRequirement(updated) });
  });

  app.post("/api/staffing/requirements/:id/convert-project", auth("admin"), async (req, res) => {
    const id = Number(req.params.id);
    try {
      const result = await withTransaction(async () => {
        const row = await getRequirementById(get, id);
        if (!row) {
          const err = new Error("需求不存在");
          err.status = 404;
          throw err;
        }
        assertCanConvert(row.status, row.converted_project_id);

        const selected = parseJsonList(row.selected_candidate_ids);
        const validation = await validateSelectedCandidates(vctx, id, selected, {
          headcount: row.headcount,
          requireAvailable: true
        });
        if (!validation.ok) {
          const err = new Error(validation.message);
          err.status = validation.status;
          throw err;
        }

        const code = `PRJ-AI-${String(id).padStart(4, "0")}`;
        const apprNo = `AP-SR-${String(id).padStart(4, "0")}`;

        let projectId = row.converted_project_id;
        if (!projectId) {
          const exists = await get("SELECT id FROM projects WHERE code = ?", [code]);
          if (exists?.id) {
            projectId = exists.id;
          } else {
            await run(
              `INSERT INTO projects (name, code, client_company, manager, status, start_date, end_date, remark)
               VALUES (?, ?, ?, ?, ?, date('now'), date('now','+90 day'), ?)`,
              [
                `${row.job_title || "灵活用工"}-${row.city || "全国"}专项`,
                code,
                row.company_name || "企业客户",
                req.user.username,
                "筹备中",
                `由用工需求 ${row.requirement_no} 自动生成（演示）`
              ]
            );
            projectId = (await get("SELECT id FROM projects WHERE code = ?", [code])).id;
          }
        }

        for (const empId of validation.ids) {
          await run(
            `INSERT OR IGNORE INTO project_assignments (project_id, employee_id, company_id, role_name, status, start_date, is_primary)
             VALUES (?, ?, ?, ?, ?, date('now'), 0)`,
            [projectId, empId, row.company_id, row.job_title || "项目成员", "待上岗"]
          );
        }

        let approvalId = row.converted_approval_id;
        if (!approvalId) {
          const existingAppr = await get("SELECT id FROM approvals WHERE no = ?", [apprNo]);
          if (existingAppr?.id) {
            approvalId = existingAppr.id;
          } else {
            await run(
              "INSERT INTO approvals (no, type, applicant, submitted_at, status, handler) VALUES (?, ?, ?, datetime('now','localtime'), ?, ?)",
              [apprNo, "用工需求立项", row.company_name || row.created_by, "已提交", req.user.username]
            );
            approvalId = (await get("SELECT id FROM approvals WHERE no = ?", [apprNo])).id;
          }
        }

        const updated = await run(
          `UPDATE staffing_requirements
           SET status='已转项目', converted_project_id=?, converted_approval_id=?, updated_at=datetime('now','localtime')
           WHERE id=? AND status='已确认'`,
          [projectId, approvalId, id]
        );
        if (!updated.changes) {
          const err = new Error("需求状态已变更，请刷新后重试");
          err.status = 409;
          throw err;
        }

        await appendRequirementEvent(run, id, "转项目", `项目 ${code}，审批 ${apprNo}`, req.user.username);
        return { code, apprNo, projectId, approvalId };
      });

      await audit(req.user, "staffing_requirement_convert", `id=${id} project=${result.code}`);
      const updated = await getRequirementById(get, id);
      res.json({ row: rowToRequirement(updated), projectCode: result.code, approvalNo: result.apprNo });
    } catch (err) {
      return sendError(res, err);
    }
  });
}

module.exports = { registerStaffingRoutes, REQUIREMENT_STATUSES };
