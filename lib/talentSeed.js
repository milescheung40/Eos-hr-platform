/** Diverse demo talent pool rows — inserted by id_no if missing (non-destructive). */

const TALENT_SEED_ROWS = [
  ["胡寿文", "360102198908093212", "13812340001", "男", "在职", "2024-09-01", "上海市", "上海市", "灵活用工", "商场安保", 5, '["巡逻","消防","应急"]', '["保安证","消防证"]', "立即", "可用", "上海市", "180-220元/天", "临港园区安保项目"],
  ["吴振辉", "310101199511213456", "13912340002", "男", "在职", "2026-03-15", "上海市", "上海市", "灵活用工", "园区安保", 4, '["巡逻","监控"]', '["保安证"]', "立即", "可用", "上海市", "170-200元/天", "商超夜班安保"],
  ["李娜", "440105199408084785", "13712340003", "女", "在职", "2022-06-01", "深圳市", "深圳市", "全职", "客服专员", 3, '["普通话","投诉处理","CRM"]', '["健康证"]', "3天内", "可用", "深圳市", "6k-8k/月", "电商热线客服"],
  ["陈浩", "110101199203034321", "13600010001", "男", "在职", "2020-01-10", "北京市", "北京市", "全职", "Java开发", 7, '["Java","Spring","MySQL","Redis"]', '["计算机二级"]', "7天内", "可用", "北京市", "18k-25k/月", "金融后台系统"],
  ["王磊", "110101199511213499", "13600010002", "男", "在职", "2019-06-01", "北京市", "北京市", "全职", "Java工程师", 6, '["Java","Spring Boot","微服务"]', '["PMP"]', "立即", "可用", "北京市", "16k-22k/月", "政务云项目"],
  ["张敏", "110101199408084788", "13600010003", "女", "在职", "2021-03-01", "北京市", "北京市", "全职", "Java开发", 5, '["Java","Vue","MySQL"]', '[]', "14天内", "已派驻", "北京市", "15k-20k/月", "ERP二次开发"],
  ["刘洋", "440305199210054322", "13700020001", "男", "在职", "2023-02-01", "深圳市", "深圳市", "全职", "客服主管", 4, '["团队管理","质检","培训"]', '["健康证"]', "立即", "可用", "深圳市", "8k-10k/月", "外包呼叫中心"],
  ["周婷", "440305199702182234", "13700020002", "女", "在职", "2024-01-15", "深圳市", "深圳市", "灵活用工", "在线客服", 2, '["打字","售后","工单"]', '[]', "立即", "可用", "深圳市", "5k-7k/月", "SaaS售后支持"],
  ["赵强", "320101199105121213", "13500030001", "男", "在职", "2022-08-01", "苏州市", "苏州市", "灵活用工", "安保巡检", 6, '["巡逻","消防","驾驶"]', '["保安证","C1"]', "立即", "可用", "苏州市", "200-240元/天", "工业园巡检"],
  ["孙伟", "310101199105121214", "13500030002", "男", "在职", "2023-05-01", "上海市", "上海市", "灵活用工", "保安队长", 8, '["排班","培训","应急"]', '["保安证","消防证"]', "3天内", "可用", "上海市", "220-260元/天", "写字楼安保"],
  ["马丽", "330101199408084786", "13400040001", "女", "在职", "2021-11-01", "杭州市", "杭州市", "灵活用工", "仓储员", 3, '["拣货","WMS","Excel"]', '["叉车证"]', "立即", "可用", "杭州市", "6k-8k/月", "电商仓配"],
  ["高峰", "320101199203034322", "13400040002", "男", "在职", "2020-04-01", "苏州市", "苏州市", "灵活用工", "仓库管理员", 5, '["收货","盘点","叉车"]', '["叉车证","健康证"]', "7天内", "可用", "苏州市", "7k-9k/月", "冷链仓储"],
  ["黄凯", "440105199511213457", "13300050001", "男", "在职", "2022-02-01", "广州市", "广州市", "灵活用工", "物流操作", 4, '["分拣","装卸","PDA"]', '["健康证"]', "立即", "可用", "广州市", "6k-8k/月", "同城配送"],
  ["林雪", "440105199702182235", "13300050002", "女", "在职", "2024-06-01", "广州市", "广州市", "灵活用工", "仓储员", 2, '["打包","贴标"]', '[]', "立即", "可用", "广州市", "5k-6k/月", "社区团购仓"],
  ["郑涛", "500101199105121215", "13200060001", "男", "在职", "2018-09-01", "重庆市", "重庆市", "全职", "Java开发", 9, '["Java","Spring Cloud","Kafka"]', '["计算机二级"]', "30天内", "不可用", "重庆市", "20k-28k/月", "支付核心系统"],
  ["何静", "310101199702182236", "13200060002", "女", "在职", "2023-09-01", "上海市", "上海市", "灵活用工", "客服", 3, '["普通话","售后"]', '["健康证"]', "立即", "可用", "上海市", "6k-7k/月", "零售会员客服"],
  ["宋杰", "110101199210054323", "13100070001", "男", "在职", "2021-07-01", "北京市", "北京市", "全职", "后端开发", 5, '["Java","Python","MySQL"]', '[]', "7天内", "可用", "北京市", "14k-18k/月", "数据中台"],
  ["唐琳", "440305199408084787", "13100070002", "女", "在职", "2024-03-01", "深圳市", "深圳市", "灵活用工", "安保", 3, '["巡逻"]', '["保安证"]', "立即", "可用", "深圳市", "190-210元/天", "园区门岗"]
];

async function seedTalentPool({ get, run }) {
  for (const row of TALENT_SEED_ROWS) {
    const [
      name,
      idNo,
      mobile,
      gender,
      status,
      hireDate,
      city,
      socialCity,
      employmentType,
      jobTitle,
      yearsExperience,
      skills,
      certificates,
      availableDate,
      availabilityStatus,
      preferredCity,
      salaryRange,
      projectExperience
    ] = row;
    const exists = await get("SELECT id FROM employees WHERE id_no = ?", [idNo]);
    if (exists) {
      await run(
        `UPDATE employees SET job_title=?, years_experience=?, skills=?, certificates=?, available_date=?,
         availability_status=?, preferred_city=?, salary_range=?, project_experience=?, is_talent_pool=1,
         city=?, social_city=?, employment_type=?, status=? WHERE id_no=?`,
        [
          jobTitle,
          yearsExperience,
          skills,
          certificates,
          availableDate,
          availabilityStatus,
          preferredCity,
          salaryRange,
          projectExperience,
          city,
          socialCity,
          employmentType,
          status,
          idNo
        ]
      );
    } else {
      await run(
        `INSERT INTO employees (name, id_no, mobile, gender, status, hire_date, city, social_city, employment_type,
          job_title, years_experience, skills, certificates, available_date, availability_status, preferred_city,
          salary_range, project_experience, is_talent_pool)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          name,
          idNo,
          mobile,
          gender,
          status,
          hireDate,
          city,
          socialCity,
          employmentType,
          jobTitle,
          yearsExperience,
          skills,
          certificates,
          availableDate,
          availabilityStatus,
          preferredCity,
          salaryRange,
          projectExperience
        ]
      );
    }
  }
}

module.exports = { TALENT_SEED_ROWS, seedTalentPool };
