const { parseJsonList } = require("./staffingMatch");

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

async function resolveCompanyId(get, user) {
  if (!user || user.role !== "enterprise") return null;
  if (user.companyId != null) return Number(user.companyId);
  const row = await get("SELECT company_id AS companyId FROM users WHERE id = ?", [user.id]);
  return row?.companyId != null ? Number(row.companyId) : null;
}

async function validateSelectedCandidates(ctx, requirementId, selectedIds, options = {}) {
  const { get, all } = ctx;
  const headcount = Math.max(1, Number(options.headcount) || 1);
  const requireAvailable = !!options.requireAvailable;

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return { ok: false, status: 400, message: "请至少选择一名候选人" };
  }

  const ids = selectedIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length !== selectedIds.length) {
    return { ok: false, status: 400, message: "候选人 ID 非法" };
  }

  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    return { ok: false, status: 400, message: "候选人不能重复" };
  }

  const maxAllowed = Math.min(50, Math.max(headcount * 3, headcount));
  if (unique.length > maxAllowed) {
    return { ok: false, status: 400, message: `候选人数不能超过 ${maxAllowed}` };
  }

  const placeholders = unique.map(() => "?").join(",");
  const matched = await all(
    `SELECT rc.employee_id AS employeeId, e.availability_status AS availabilityStatus,
            e.is_talent_pool AS isTalentPool, e.status AS empStatus, e.name
     FROM staffing_requirement_candidates rc
     JOIN employees e ON e.id = rc.employee_id
     WHERE rc.requirement_id = ? AND rc.employee_id IN (${placeholders})`,
    [requirementId, ...unique]
  );

  if (matched.length !== unique.length) {
    return { ok: false, status: 400, message: "存在不在本次匹配结果中的候选人" };
  }

  const invalidPool = matched.filter((m) => !m.isTalentPool);
  if (invalidPool.length) {
    return { ok: false, status: 400, message: "存在不在人才库可见范围内的候选人" };
  }

  if (requireAvailable) {
    const unavailable = matched.filter((m) => (m.availabilityStatus || "可用") !== "可用");
    if (unavailable.length) {
      return {
        ok: false,
        status: 409,
        message: `以下候选人当前不可用：${unavailable.map((m) => m.name || m.employeeId).join("、")}`
      };
    }
  }

  return { ok: true, ids: unique };
}

function assertCanSubmit(status) {
  if (!["草稿", "已推荐"].includes(status)) {
    throw conflict(`当前状态「${status}」不可提交，仅「草稿」或「已推荐」可提交`);
  }
}

function assertCanConfirm(status) {
  if (status !== "待确认") {
    throw conflict(`仅「待确认」状态可确认，当前为「${status}」`);
  }
}

function assertCanConvert(status, convertedProjectId) {
  if (status === "已转项目" || convertedProjectId) {
    throw conflict("需求已转项目，不可重复操作");
  }
  if (status !== "已确认") {
    throw conflict(`仅「已确认」状态可转项目，当前为「${status}」`);
  }
}

module.exports = {
  resolveCompanyId,
  validateSelectedCandidates,
  assertCanSubmit,
  assertCanConfirm,
  assertCanConvert,
  conflict,
  badRequest,
  forbidden,
  parseJsonList
};
