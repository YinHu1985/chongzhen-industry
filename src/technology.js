/**
 * A speculative industrial programme, not a historical manufacturing manual.
 * Dependencies are game abstractions. Dates describe the knowledge brought back
 * by the protagonist, not technology actually fielded by Chongzhen's government.
 */
export const SOURCES = {
  darby: { label: 'Historic England · Coalbrookdale高炉', url: 'https://historicengland.org.uk/listing/heritage-gateway/results/record/2f000900-da89-446c-af1a-55ae6fb05a9d/MSA453' },
  hotBlast: { label: 'North Lanarkshire Museums · 热风炼铁', url: 'https://www.northlanmuseums.co.uk/story/the-bairds-of-gartsherrie/' },
  bessemer: { label: 'Science Museum · 贝塞麦转炉', url: 'https://collection.sciencemuseumgroup.org.uk/objects/co19568/original-pilot-bessemer-converter-1865' },
  machineTools: { label: 'Science Museum · 莫兹利车床', url: 'https://collection.sciencemuseumgroup.org.uk/objects/co46283' },
  minie: { label: 'National Army Museum · 1851式米尼枪', url: 'https://collection.nam.ac.uk/detail.php?acc=1994-06-3-1' },
  musket: { label: 'National Park Service · 火器演变', url: 'https://home.nps.gov/fosc/learn/education/weaponevolution.htm' },
  napoleon: { label: 'National Park Service · 安提坦火炮', url: 'https://www.nps.gov/anti/learn/historyculture/arty.htm' },
  bronze: { label: 'National Park Service · 拿破仑青铜炮', url: 'https://www.nps.gov/places/the-24-gun-battery.htm' },
  breechloader: { label: 'Springfield Armory · 后装枪演变', url: 'https://www.nps.gov/spar/learn/historyculture/evolution-of-the-breechloader.htm' },
  ammunition: { label: 'National Park Service · 南北战争军械', url: 'https://www.nps.gov/articles/000/civil-war-weapons-in-the-shenandoah-valley.htm' },
  armstrong: { label: '美国国务院史料档案 · 1863年阿姆斯特朗炮记述', url: 'https://history.state.gov/historicaldocuments/frus1864p3/d312' },
  crucible: { label: 'Sheffield Museums · 亨茨曼坩埚钢', url: 'https://sheffieldmuseums.org.uk/whats-on/benjamin-huntsman-clock/' },
  wrought: { label: 'Science Museum · 搅炼熟铁', url: 'https://collection.sciencemuseumgroup.org.uk/objects/co19863/two-links-of-an-anchor-chain-forged-from-puddled-iron-with-cast-iron-stubs-late-18th-to-mid-19th-century' },
  qijiguang: { label: '故宫博物院 · 戚继光与练兵著作', url: 'https://www.dpm.org.cn/lemmas/244776.html' },
  matchlock: { label: '山西大学科学技术史研究所 · 明代鸟铳', url: 'https://ihst.sxu.edu.cn/kycg/lw/32be75398657430196f2d7f9babeb3e3.htm' },
  redCannon: { label: '文化部典藏网 · 明代红夷铜炮', url: 'https://tcmb.culture.tw/zh-tw/detail?id=110000011343&indexCode=MOCCOLLECTIONS' },
  cavalry: { label: 'National Army Museum · 骑兵的分工', url: 'https://www.nam.ac.uk/explore/cavalry-roles' },
  armor: { label: 'Metropolitan Museum · 17世纪胸甲骑兵铠甲', url: 'https://www.metmuseum.org/art/collection/search/24985' },
  armory: { label: 'Springfield Armory · 互换制造', url: 'https://www.nps.gov/spar/learn/historyculture/making-guns.htm' },
  puddling: { label: 'Historic England · 搅炼与轧制研究', url: 'https://historicengland.org.uk/research/results/reports/5984/DownsideMillCobhamSurreyAnalysisoftheMetalworkingRemains' },
  archaeometallurgy: { label: 'Historic England · 古代冶金', url: 'https://historicengland.org.uk/images-books/publications/archaeometallurgy-guidelines-best-practice/heag003-archaeometallurgy-guidelines/' },
};

export const TECH_BRANCHES = [
  { id: 'metallurgy', name: '矿冶与材料', color: '#b76c38', description: '木炭、焦炭与热风高炉，通向熟铁、工具钢和规模炼钢。' },
  { id: 'machinery', name: '动力与母机', color: '#437c77', description: '让作坊从凭手艺制作，走向依靠量具和机器稳定复制。' },
  { id: 'smallarms', name: '枪械与弹药', color: '#786594', description: '火绳、燧发与击发枪械，以及从纸包弹到金属定装弹的发展。' },
  { id: 'artillery', name: '铸炮与炮队', color: '#ae4e42', description: '青铜与铁制炮身、前后装结构，以及炮架、弹药与运输保障。' },
  { id: 'army', name: '军制与供军', color: '#70824b', description: '操典、军官教育与军需保障，共同构成部队的组织和训练体系。' },
];

export const TECH_ERAS = [
  { id: 0, name: '立局', subtitle: '盘家底 · 定尺度' },
  { id: 1, name: '开炉', subtitle: '基础材料 · 新军规制' },
  { id: 2, name: '筑基', subtitle: '焦炭高炉 · 军官与后勤' },
  { id: 3, name: '试制', subtitle: '初代机器 · 早期军械' },
  { id: 4, name: '改良', subtitle: '加工体系 · 工具钢' },
  { id: 5, name: '分流', subtitle: '线膛与击发 · 野战炮兵' },
  { id: 6, name: '成套', subtitle: '母机复制 · 弹药产线' },
  { id: 7, name: '跨越', subtitle: '米尼步枪 · 阿姆斯特朗炮' },
  { id: 8, name: '精进', subtitle: '后装枪 · 金属定装弹' },
  { id: 9, name: '决胜', subtitle: '新军守京 · 改写结局' },
];

// Investment tiers retain their balance independently of the derived graph depth.
const project = (id, name, branch, tier, prerequisites, details) => ({
  id, name, branch, category: branch === 'army' ? 'army' : ['smallarms', 'artillery'].includes(branch) ? 'arms' : 'industry',
  icon: ({ metallurgy: '炉', machinery: '机', smallarms: '铳', artillery: '炮', army: '旗' })[branch],
  cost: 2800 + tier * 300, testCost: 1400 + tier * 200, prestige: 4 + Number(tier >= 4) + Number(tier >= 6),
  minimum: 40, work: tier < 2 ? 1 : tier < 5 ? 2 : 3,
  prerequisites, transfers: {}, tags: [],
  ...details,
});

const CATALOG = [
  project('survey', '矿料与工场勘察', 'metallurgy', 0, [], {
    description: '勘察矿石、燃料、水源与运输条件，为工场选址和原料供应提供依据。',
    benefits: '解锁炼铁炉场的选址前置，以及炼焦与青铜铸造科技。', tags: ['开局', '原料'],
    technical: '矿藏品位、开采难度和运距共同影响材料成本；水力与季节变化也会限制工场的位置和规模。',
    historical: '早期冶金工场常依矿山、林地和河流而建。英国煤炭与运河的发展，逐渐改变了工业设施的分布。',
  }),
  project('school', '工匠学堂', 'machinery', 0, [], {
    description: '以识图、算术与工艺记录补充师徒传授，形成有共同知识基础的工匠群体。',
    benefits: '作为军官教育与标准化量产的前置。', tags: ['人才', '通用基础'],
    technical: '图样和书面记录使经验能够复核、传授；课堂知识仍须结合实际操作，才能转化为熟练技艺。',
    historical: '传统手工业长期依靠师徒制度。近代技术学校逐步把数学、制图与机械知识纳入职业教育。',
  }),
  project('standards', '统一度量与样规', 'machinery', 0, [], {
    description: '统一尺度、样件和量规，使不同工场对尺寸与成品质量采用共同依据。',
    benefits: '解锁机床、军械和检验科技。', tags: ['量具', '通用基础'],
    technical: '计量基准减少测量分歧，量规便于重复检验；零件互换还要求加工误差稳定受控，并非统一尺子即可实现。',
    historical: '统一度量衡有悠久历史。工业制造的发展进一步推动了精密量具、公差与互换标准的形成。',
  }),
  project('water_power', '水力动力工场', 'machinery', 0, [], {
    description: '利用水轮和传动装置驱动鼓风、锻锤及加工设备，为工场提供连续动力。',
    benefits: '为炼铁炉场提供动力前置；解锁高炉和轧制设备。', tags: ['动力', '水轮'],
    technical: '水流能量经轮轴与传动机构转化为机械运动；可用功率受水量、落差和季节影响，工场因而依赖合适水源。',
    historical: '水力机械早已用于磨坊与冶金。蒸汽动力普及以前，河流两岸是许多制造业聚集的地点。',
  }),
  project('iron', '水力木炭高炉', 'metallurgy', 1, ['survey', 'water_power'], {
    description: '以木炭为燃料、水力驱动鼓风的高炉，能够持续生产液态生铁。',
    benefits: '解锁早期兵器与机床，可绕开炼焦路线。', tags: ['高炉', '木炭', '生铁'],
    technical: '高炉还原铁矿并使铁吸收碳；所得生铁适于铸造，但通常较脆，须经精炼才能成为熟铁或钢。',
    historical: '科尔布鲁克代尔旧高炉始建于1638年，早期使用木炭；达比于1709年在那里开展焦炭炼铁。', source: SOURCES.darby,
  }),
  project('coking', '炼焦工场', 'metallurgy', 1, ['survey'], {
    description: '焦炭是煤炭热解后形成的多孔含碳燃料，兼具供热与支撑炉料的作用。',
    benefits: '解锁焦炭冷风高炉，形成木炭高炉的替代路径。', tags: ['燃料', '焦炭'],
    technical: '焦炭的强度、灰分和反应性影响高炉运行；煤种差异很大，并非所有煤都能形成适合冶金的焦炭。',
    historical: '1709年达比在科尔布鲁克代尔使用焦炭炼铁。此后英国逐渐扩大应用，减少冶铁对木炭的依赖。', source: SOURCES.darby,
  }),
  project('drill_manual', '基础新军操典', 'army', 1, ['school'], {
    description: '操典规定军纪、指挥口令与操练要求，使不同部队能够按共同规范行动。',
    benefits: '解锁军队训练、军官学堂与后勤。', tags: ['训练', '制度'],
    technical: '统一动作和指挥术语有助于多人协作；熟练程度来自反复训练，军官与士卒须对同一命令形成一致理解。',
    historical: '明代戚继光著有《纪效新书》《练兵实纪》，系统论述练兵、治械与阵法，留下丰富的军队训练记录。', source: SOURCES.qijiguang,
  }),
  project('powder_supply', '火药定额与库务', 'smallarms', 1, ['school', 'standards'], {
    description: '火药库务管理批次、储存和领发记录，保持军需品质量与数量可查。',
    benefits: '为纸包弹、击发军械和炮兵弹药提供共同供应基础。', tags: ['军需', '弹药基础'],
    technical: '火药易受潮且存在燃烧危险，库房条件、包装状况与储存时间都会影响品质；批次记录有助于追查差异。',
    historical: '火药武器普及后，弹药储运成为常设军务。军队规模扩大，也使集中管理和定额供应日益重要。',
  }),
  project('bronze_foundry', '青铜铸造工场', 'metallurgy', 1, ['survey', 'standards'], {
    description: '青铜铸造以铜合金制造器物，曾广泛用于钟、工具以及各类火炮。',
    benefits: '提供青铜铸炮路线，作为拿破仑野战炮的材料前置。', tags: ['青铜', '替代路线'],
    technical: '合金性质与铸件缺陷共同影响强度和寿命；青铜具有良好铸造性能，但铜料价格和供应限制了使用规模。',
    historical: '青铜炮与铁炮长期并用。19世纪的拿破仑野战炮仍采用青铜炮身，说明其使用并未随铁炮出现而终止。', source: SOURCES.bronze,
  }),
  project('coke_furnace', '焦炭冷风高炉', 'metallurgy', 2, ['coking', 'water_power'], {
    description: '焦炭冷风高炉以焦炭作为燃料，采用未经专门预热的鼓风生产生铁。',
    benefits: '可替代木炭高炉，作为熟铁和热风高炉的基础。', tags: ['高炉', '焦炭', '生铁'], transfers: { iron: 18 },
    technical: '焦炭承担燃料、还原剂和炉料支架的作用，强度与透气性影响炉况；冷风与热风指的是送风条件。',
    historical: '18世纪英国逐步推广焦炭炼铁。煤炭资源与配套运输的发展，使铁厂能够突破部分木炭供应限制。', source: SOURCES.darby,
  }),
  project('cold_arms', '改良冷兵器与甲具', 'smallarms', 2, [], {
    prerequisiteAny: ['iron', 'coke_furnace'],
    description: '刀矛与甲具的可靠性取决于材料、结构和制作质量，也取决于日常维护。',
    benefits: '解锁初期步骑兵装备；提供后续军械的试制经验。', tags: ['早期成果', '冷兵器'], transfers: { standards: 12 },
    technical: '刃部需要保持锋利，受力部位则要避免脆断；兵器与护具通常须在硬度、韧性、重量之间取得平衡。',
    historical: '冷兵器和火器在明代及近代早期长期并用。军队既需要远射兵器，也保留近战武器和防护装具。',
  }),
  project('lathe', '初代金属车床', 'machinery', 2, ['standards'], {
    prerequisiteAny: ['iron', 'coke_furnace'],
    description: '金属车床利用工件旋转与刀具进给，加工轴、螺纹等具有回转形状的零件。',
    benefits: '解锁军器工场，以及镗床、刨床与质量检验科技。', tags: ['母机', '加工'], transfers: { civil_works: 10 },
    technical: '刀架和导轨约束刀具运动，减少完全凭手工控制带来的差异；机床刚性、磨损与测量水平共同影响精度。',
    historical: '18世纪末至19世纪初，莫兹利等人改进金属车床和螺纹加工设备，推动机床成为机器制造的基础。', source: SOURCES.machineTools,
  }),
  project('matchlock', '制式火绳鸟铳', 'smallarms', 2, ['standards'], {
    prerequisiteAny: ['iron', 'coke_furnace'],
    description: '火绳鸟铳是以燃烧火绳点火的肩射火器，在明代军队中已有广泛应用。',
    benefits: '步兵获得早期火器训练能力；为燧发枪提供经验。', tags: ['火绳', '前装', '早期火器'], transfers: { cold_arms: 16 },
    technical: '枪机把点火动作与持枪瞄准结合，但火绳需持续燃烧，风雨和潮湿会影响使用；多数鸟铳采用前装滑膛结构。',
    historical: '传入明代中国的火绳枪经历了仿制和改进，见于东南沿海、北部边防及明清战争的相关记录。', source: SOURCES.matchlock,
  }),
  project('cannon', '红夷式守备铸铁炮', 'artillery', 2, ['standards'], {
    prerequisiteAny: ['iron', 'coke_furnace'],
    description: '红夷式长管火炮用于攻守城寨和阵地，铸铁炮身是其材料形式之一。',
    benefits: '解锁炮兵训练与炮架项目；为两条后续炮兵路线积累经验。', tags: ['铸铁', '前装', '守备'], transfers: { cold_arms: 10 },
    technical: '前装滑膛炮结构较为简单，炮身重量与炮架条件影响运输；重炮的阵地运用还需要稳定的弹药和人员保障。',
    historical: '红夷炮是晚明对传入欧洲式火炮的称呼，既有铸铁也有青铜实例，并非专指某一种炮身材料。', source: SOURCES.redCannon,
  }),
  project('civil_works', '铁器与民用工坊', 'machinery', 2, [], {
    prerequisiteAny: ['iron', 'coke_furnace'],
    description: '民用铁器工坊制造农具、手工具和维修用件，服务农业与日常生产。',
    benefits: '为机床、工装和连续生产提供可继承的制造经验。', tags: ['制造经验', '民用'], transfers: { standards: 10 },
    technical: '铸造适合一定形状的成批器物，锻造适合需要韧性的工具；使用要求决定材料选择和制作方式。',
    historical: '农具与手工具长期占据铁器需求的重要部分。民用制造、机械维修和军器生产也常共享工匠与设备。',
  }),
  project('officer_school', '新军军官学堂', 'army', 2, ['drill_manual', 'school'], {
    description: '军官教育结合军事知识、指挥能力与行政事务，培养能够组织部队的人员。',
    benefits: '基础火枪步兵与守备炮兵的训练上限提升至100；满足终局军制前置。', tags: ['人才', '军官'], transfers: { cold_arms: 8 },
    technical: '识图、算术和书面命令有助于处理地形、补给与协同；课堂学习必须结合操练和实际指挥经验。',
    historical: '传统军官常从实战和师承中学习。近代军事学校逐步采用固定课程，把工程、数学与军事训练结合。',
  }),
  project('logistics', '新军军需与运输', 'army', 2, ['drill_manual'], {
    description: '军需体系统筹粮食、被服、军械和运输，使部队能够长期驻守或行军。',
    benefits: '解锁协同训练与修械队；最终决战所需的保障基础。', tags: ['后勤', '通用前置'], transfers: { civil_works: 12 },
    technical: '运力、道路、仓储与领发制度共同影响补给；马匹也消耗草料，运输规模并不能只按士卒人数估算。',
    historical: '军队历来依赖后方仓储和运输网络。水运便于搬运大宗物资，陆路转运则常受季节与路况制约。',
  }),
  project('hot_blast', '热风高炉', 'metallurgy', 3, ['standards'], {
    prerequisiteAny: ['iron', 'coke_furnace'], description: '热风高炉在送风进入炉内前予以预热，提高冶炼的热量利用效率。',
    benefits: '为大规模炼钢提供材料前置，也可迁移到熟铁项目。', tags: ['高炉', '热风', '产能'], transfers: { coke_furnace: 18, iron: 10 },
    technical: '预热空气减少炉内为冷空气升温所消耗的热量，改善燃料利用；热风属于送风技术，与燃料种类是不同概念。',
    historical: '尼尔森于1828年取得热风法专利。该技术在苏格兰冶铁业推广，对19世纪高炉生产影响显著。', source: SOURCES.hotBlast,
  }),
  project('wrought_iron', '搅炼熟铁', 'metallurgy', 3, [], {
    prerequisiteAny: ['iron', 'coke_furnace'], description: '搅炼法将生铁精炼为低碳熟铁，提供适于锻造和轧制的金属材料。',
    benefits: '解锁坩埚钢、轧制和熟铁组合炮身科技。', tags: ['熟铁', '精炼'], transfers: { hot_blast: 10 },
    technical: '氧化作用降低铁中的碳含量；熟铁常含少量条状炉渣，具有与铸铁不同的组织和加工性能。',
    historical: '科特在18世纪80年代取得搅炼与轧制相关专利。搅炼熟铁在19世纪被广泛用于机械、桥梁和船舶。', source: SOURCES.puddling,
  }),
  project('boring_machine', '卧式镗床', 'machinery', 3, ['lathe'], {
    description: '镗床用于加工已有孔的内表面，改善孔径、直线度和表面质量。',
    benefits: '解锁线膛加工与母机标准化，支持拿破仑炮。', tags: ['母机', '精度'], transfers: { cannon: 14 },
    technical: '机床约束刀具与工件的相对运动，减少孔形偏差；大件加工还受支承刚性、振动和测量手段影响。',
    historical: '18世纪后期，精确镗孔与蒸汽机汽缸制造相互促进。随后镗床成为大型机械零件加工的重要设备。',
  }),
  project('planer', '金属刨床', 'machinery', 3, ['lathe'], {
    description: '金属刨床通过直线往复运动切削平面，常用于机器底座、导轨等零件。',
    benefits: '为标准母机与精密工具提供加工前置。', tags: ['母机', '机器制造'], transfers: { civil_works: 10 },
    technical: '平面度和相互位置会影响整机装配；机床导向、刀具状态与工件支承共同决定加工表面的质量。',
    historical: '金属刨床在19世纪机床工业中逐步发展，与车床、镗床等设备配合，扩大了机器制造的加工范围。',
  }),
  project('quality_control', '材料与成品检验', 'machinery', 3, ['lathe', 'standards'], {
    description: '质量检验通过测量、检查和记录，识别材料与成品是否符合规定要求。',
    benefits: '作为精密军械与弹药检验的共同前置。', tags: ['质量', '可靠性'], transfers: { standards: 15, cannon: 8 },
    technical: '尺寸、材料性能和外观缺陷需要不同的检验方法；保留批次记录有助于追踪问题，发现生产中的系统性偏差。',
    historical: '传统作坊已有验货与试用制度。工厂规模扩大后，专用量规、检验岗位和统一记录日益普遍。', source: SOURCES.armory,
  }),
  project('muskets', '燧发滑膛枪', 'smallarms', 3, ['matchlock', 'lathe'], {
    description: '燧发滑膛枪以燧石击打钢片产生火花，曾是欧洲军队的主要步兵武器。',
    benefits: '提高步兵训练上限；解锁骑兵火枪与后续击发枪。', tags: ['燧发', '前装', '滑膛'], transfers: { matchlock: 22, quality_control: 8 },
    technical: '燧发机构无需保持燃烧火绳，但仍会受到潮湿影响；滑膛指枪管内壁结构，与点火和装填方式分别相关。',
    historical: '燧发枪在17至18世纪广泛发展。19世纪击发枪逐渐取代它，但旧式燧发武器仍继续服役一段时期。', source: SOURCES.musket,
  }),
  project('paper_cartridges', '制式纸包弹产线', 'smallarms', 3, ['matchlock', 'powder_supply'], {
    description: '纸包弹以纸质包装集中携带弹丸与发射药，便于运输、领发和使用。',
    benefits: '为米尼弹药产线积累经验；供军能力从军械扩展到耗材。', tags: ['前装弹药', '产线'], transfers: { standards: 12 },
    technical: '包装提高军需品的一致性，却不能像金属弹壳那样承担膛内密封；纸包弹名称本身也不能判定枪械的装填方式。',
    historical: '纸包弹在近代军用火器中长期使用，19世纪前装步枪仍大量采用，后来也出现适用于后装枪的形式。', source: SOURCES.ammunition,
  }),
  project('gun_carriages', '野战炮架与挽运', 'artillery', 3, ['cannon', 'logistics'], {
    description: '炮架承托炮身并便于调整与转移，挽运车辆和马匹构成野战炮队的运输体系。',
    benefits: '支持拿破仑炮与炮兵供给；可向骑兵装备项目迁移经验。', tags: ['野战', '运输'], transfers: { cold_arms: 8 },
    technical: '炮架须承受射击载荷，同时兼顾重量与维修；道路、马力和车轮状态都会影响炮队到达阵地的能力。',
    historical: '近代野战炮通常配有炮车、前车和弹药车辆。火炮机动性取决于整套运输组织，而不只取决于炮身。',
  }),
  project('crucible_steel', '坩埚工具钢', 'metallurgy', 4, ['wrought_iron'], {
    description: '坩埚炼钢以容器熔炼获得较均匀的钢材，适于工具和精细制品。',
    benefits: '为精密工具与后装军械提供材料前置。', tags: ['工具钢', '小批优质'], transfers: { quality_control: 12 },
    technical: '熔化有助于均匀成分，隔离炉内燃料可减少污染；单炉规模与耐火容器限制了生产量和成本。',
    historical: '坩埚钢有悠久历史。18世纪亨茨曼改进的英国工艺先用于钟表等小型制品，后来推动谢菲尔德钢业发展。', source: SOURCES.crucible,
  }),
  project('rolling_mill', '轧制与型材工场', 'metallurgy', 4, ['wrought_iron', 'water_power'], {
    description: '轧机利用成对转动的轧辊使金属变形，生产板材、棒材和各种型材。',
    benefits: '为组合炮身和金属弹壳产线提供型材前置。', tags: ['型材', '材料加工'], transfers: { hot_blast: 12 },
    technical: '轧制改变材料截面与形状，连续作业有利于尺寸一致；原料状态、设备刚性和加工条件都会影响成品质量。',
    historical: '轧制随近代熟铁工业扩展，并广泛服务于铁路、造船和机械制造，逐步成为金属加工的主要方法之一。', source: SOURCES.puddling,
  }),
  project('bessemer_steel', '贝塞麦式转炉钢', 'metallurgy', 4, ['hot_blast', 'quality_control'], {
    description: '贝塞麦转炉以吹入空气氧化铁水中的部分杂质，适合大批量炼钢。',
    benefits: '为精密工具提供可继承的材料经验，属于可选冶金路线。', cost: 5000, tags: ['转炉钢', '规模化', '可选'], transfers: { wrought_iron: 12 },
    technical: '氧化反应释放热量，使金属维持液态；早期酸性转炉难以去除磷，因此对原料有较严格要求。',
    historical: '19世纪中叶，贝塞麦法促进较廉价钢材的大规模生产。原料适应性和成品质量仍是早期推广的重要难题。', source: SOURCES.bessemer,
  }),
  project('rifling', '线膛加工验证', 'machinery', 4, ['boring_machine', 'quality_control'], {
    description: '膛线使弹丸沿枪炮轴线旋转，有助于保持飞行姿态和改善射击精度。',
    benefits: '同时支持米尼步枪、线膛炮与配套弹药。', tags: ['线膛', '共用技术'], transfers: { muskets: 12, cannon: 12 },
    technical: '膛线与弹丸的配合影响旋转传递及密封；线膛、点火方式和前后装分别描述火器的不同结构特征。',
    historical: '线膛武器早于19世纪已有使用，后来随加工与弹药改进逐步普及。米尼前装枪和阿姆斯特朗后装炮均采用线膛。', source: SOURCES.napoleon,
  }),
  project('percussion_caps', '击发药帽工业验证', 'smallarms', 4, ['quality_control', 'powder_supply'], {
    description: '击发药帽以受撞击后产生的火焰引燃发射药，取代燧石产生火花的方式。',
    benefits: '解锁击发枪和米尼弹药；为金属定装弹提供经验。', tags: ['击发', '配套供应'],
    technical: '药帽使点火源更加集中，较少暴露于风雨；可靠性仍取决于储存状态、制品一致性和枪械配合。',
    historical: '击发系统在19世纪上半叶逐步推广。许多燧发枪经过改装继续使用，米尼式前装步枪也采用击发点火。', source: SOURCES.minie,
  }),
  project('cavalry_gun', '制式骑兵火枪', 'smallarms', 4, ['muskets', 'officer_school'], {
    description: '骑兵火枪通常采用便于携行的短枪形制，适应骑乘运输与下马射击的需要。',
    benefits: '提高骑兵训练上限；扩大既有军械平台的用途。', tags: ['骑兵', '共用平台'], transfers: { muskets: 25, gun_carriages: 8 },
    technical: '缩短和减轻枪身有利于携带，却会影响瞄准基线及弹道表现；短枪也可能采用不同的点火和装填方式。',
    historical: '近代龙骑兵最初具有骑马步兵性质，常装备短枪与刀剑。不同国家的骑兵在火力与冲击任务之间各有侧重。', source: SOURCES.cavalry,
  }),
  project('standard_tools', '标准母机与工装', 'machinery', 4, ['planer', 'boring_machine', 'quality_control'], {
    description: '母机、夹具与量规组成制造体系，使同类零件能够按照共同标准生产。',
    benefits: '解锁稳定量产、修械队和精密工具。', tags: ['母机体系', '复制能力'], transfers: { civil_works: 10, school: 10 },
    technical: '夹具约束工件位置，量规检查尺寸；设备精度、工具磨损和人员操作仍会造成差异，需要持续校准与维护。',
    historical: '19世纪军工厂推动专用机器和互换制造。零件由逐件修配转向一致生产，是一个逐步完善的过程。', source: SOURCES.armory,
  }),
  project('napoleon_gun', '拿破仑12磅野战炮', 'artillery', 4, ['bronze_foundry', 'boring_machine', 'gun_carriages', 'quality_control'], {
    description: '拿破仑12磅炮是一种青铜前装滑膛野战炮，可承担多种战场火力任务。',
    benefits: '完成即列装拿破仑炮；持续供军由独立炮兵弹药科技支撑。', tags: ['制式军械', '青铜', '前装滑膛'], transfers: { cannon: 20 },
    technical: '“12磅”指其标准实心弹的重量等级；滑膛炮可使用不同种类的弹药，炮架和挽运体系决定部署条件。',
    historical: '该炮名称源于拿破仑三世。美式1857型在美国内战中广泛使用，是这一炮型的著名实例。', source: SOURCES.napoleon,
  }),
  project('artillery_supply', '前装炮兵弹药产线', 'artillery', 4, ['powder_supply', 'quality_control', 'gun_carriages'], {
    description: '前装炮兵军需包括不同用途的炮弹、发射药及包装运输器具。',
    benefits: '完成拿破仑路线的弹药要求；为线膛炮弹药提供经验。', tags: ['配套弹药', '前装弹药', '产线'], transfers: { paper_cartridges: 10, cannon: 12 },
    technical: '口径与炮型决定弹药的适用范围；实心弹、榴弹和霰弹的作用不同，库务须防止型号混淆并保持批次可查。',
    historical: '近代炮队通常配有专门的弹药车辆和军需人员。前装炮时代，持续补给已是炮兵运用的重要条件。',
  }),
  project('percussion_musket', '击发式前装枪', 'smallarms', 5, ['muskets', 'percussion_caps'], {
    description: '击发式前装枪使用药帽点火，仍从枪口装入弹药，是19世纪常见军用火器。',
    benefits: '成为米尼步枪和后装机构的共同前置。', tags: ['击发', '前装', '过渡项目'], transfers: { muskets: 22 },
    technical: '击发机构改变点火方式，却不改变前装的基本结构；同类点火系统可用于滑膛枪，也可用于线膛枪。',
    historical: '19世纪军队逐步从燧发转向击发装备，既有新造枪械，也有旧枪改装。后装枪普及前，这类武器使用广泛。', source: SOURCES.musket,
  }),
  project('precision_tools', '精密工具与配合标准', 'machinery', 5, ['standard_tools', 'crucible_steel'], {
    description: '精密工具、量具与配合标准使零件在规定误差范围内共同工作。',
    benefits: '解锁后装机构、金属弹壳与阿姆斯特朗炮。', tags: ['精密加工', '工具钢'], transfers: { bessemer_steel: 10 },
    technical: '公差限定尺寸变化，配合决定接触或间隙关系；工具磨损、测量误差与温度变化都可能影响最终精度。',
    historical: '近代精密工程随着机床和计量技术逐步发展。军械、钟表和机械制造均推动了尺寸一致性与零件互换。', source: SOURCES.armory,
  }),
  project('mass_production', '制式军械稳定量产', 'machinery', 5, ['standard_tools', 'school'], {
    description: '稳定量产依靠固定工序、专用设备与质量管理，连续提供一致的制品。',
    benefits: '步兵与炮兵共同需要的供军规模前置。', tags: ['量产', '生产组织'], transfers: { civil_works: 12, muskets: 10, cannon: 10 },
    technical: '分工和工装减少重复劳动，但瓶颈工序、工具磨损与原料差异仍会影响交付；产量和合格率须同时关注。',
    historical: '19世纪军工厂是互换制造的重要实践场所。机器加工和统一量规逐渐减少了成品对手工修配的依赖。', source: SOURCES.armory,
  }),
  project('repair_corps', '随军修械队', 'army', 5, ['logistics', 'standard_tools'], {
    description: '随军修械人员负责检查、修理和保养装备，减少器械损坏对部队的影响。',
    benefits: '为后期军务提供经验，改善复杂军械路线的保障基础。', tags: ['维修', '军工协作'], transfers: { mass_production: 15 },
    technical: '维修需要工具、备件和故障记录；零件越一致，调换越方便，复杂损伤则仍需后方工场处理。',
    historical: '军队长期携有工匠承担修造事务。近代军械日益复杂，维修逐步形成更专门的人员分工和保障组织。',
  }),
  project('forged_gun_body', '熟铁组合炮身验证', 'artillery', 5, ['rolling_mill', 'quality_control'], {
    description: '熟铁组合炮身由多个金属部分构成，与整体铸造的青铜炮或铸铁炮不同。',
    benefits: '解锁阿姆斯特朗炮；与青铜铸炮形成不同的材料路线。', tags: ['熟铁', '组合炮身'], transfers: { cannon: 12, boring_machine: 12 },
    technical: '熟铁的韧性和组合结构可用于承受炮膛载荷，但材料质量、接合可靠性与各部分的一致性都影响耐用程度。',
    historical: '19世纪中叶的早期阿姆斯特朗炮采用熟铁组合炮身。后来的钢制火炮属于不同的材料发展阶段。', source: SOURCES.armstrong,
  }),
  project('minie_ammo', '米尼弹与纸包弹产线', 'smallarms', 5, ['paper_cartridges', 'percussion_caps', 'quality_control', 'rifling'], {
    description: '米尼弹是适用于前装线膛枪的锥形弹丸，通常与纸包弹供应方式配合。',
    benefits: '完成米尼路线的弹药要求；与步枪研发可以并行。', tags: ['配套弹药', '米尼', '前装纸包弹'], transfers: { paper_cartridges: 22 },
    technical: '其空心底部在发射时膨胀，与膛线贴合并获得旋转；这种结构兼顾前装便利和线膛所需的弹膛配合。',
    historical: '米尼式弹丸在19世纪中叶推动军用线膛枪普及。英国1851式米尼枪是采用这一原理的历史实例。', source: SOURCES.minie,
  }),
  project('rifled_shells', '线膛炮配套弹药', 'artillery', 5, ['rifling', 'artillery_supply'], {
    description: '线膛炮弹与炮膛配合获得旋转，多采用适于稳定飞行的长形弹体。',
    benefits: '完成阿姆斯特朗路线的弹药要求。', tags: ['配套弹药', '线膛炮', '弹药产线'], transfers: { artillery_supply: 22, minie_ammo: 8 },
    technical: '弹体外形、重量与膛线配合影响弹道；同为线膛炮也可能采用不同弹药，口径相近不等于能够通用。',
    historical: '19世纪线膛炮发展期间，军队采用了多种弹丸结构。不同炮型的弹药兼容性是当时军需管理的重要问题。', source: SOURCES.napoleon,
  }),
  project('cartridge_cases', '金属弹壳产线', 'smallarms', 6, ['rolling_mill', 'precision_tools'], {
    description: '金属弹壳承载弹药部件，并在发射时参与密封，减少火药气体向后逸出。',
    benefits: '解锁金属定装弹；与后装枪机构可以并行。', tags: ['后装配套', '精密产线'], transfers: { paper_cartridges: 8, mass_production: 12 },
    technical: '弹壳须兼顾强度、延展性和尺寸一致性；枪械还需可靠地支承与退出弹壳，材料和机构必须相互适应。',
    historical: '19世纪金属弹壳随后装枪发展而推广。它既改变弹药包装，也成为枪械闭锁与供弹体系的一部分。', source: SOURCES.breechloader,
  }),
  project('breech_actions', '后装机构工程验证', 'smallarms', 6, ['precision_tools', 'percussion_musket'], {
    description: '后装机构允许从枪管后端装入弹药，并在射击时保持炮尾或枪尾封闭。',
    benefits: '解锁制式后装步枪；可向后装炮迁移部分工程经验。', tags: ['后装', '机构'], transfers: { percussion_musket: 18, quality_control: 10 },
    technical: '闭锁承担膛内压力，密封限制气体逸出，两者是相关而不同的要求；反复使用还会考验机构磨损与可靠性。',
    historical: '早期后装火器存在多种结构，也使用过纸质弹药。后装并不天然等同于金属定装弹或某一种枪机形式。', source: SOURCES.breechloader,
  }),
  project('minie_rifle', '米尼式前装线膛步枪', 'smallarms', 6, ['percussion_musket', 'rifling'], {
    description: '米尼式步枪将击发点火、前装线膛枪管与膨胀式弹丸结合，用于步兵射击。',
    benefits: '完成即列装米尼步枪；与配套弹药、量产和新军训练共同达成终局。', tags: ['制式军械', '前装线膛', '米尼'], transfers: { percussion_musket: 22, minie_ammo: 8 },
    technical: '膛线赋予弹丸旋转，米尼弹的结构便于前装时使用；这一体系提高了线膛枪在普通步兵中的实用性。',
    historical: '英国1851式米尼枪是早期制式实例，曾用于克里米亚战争。19世纪中叶，前装线膛枪在多国军队中推广。', source: SOURCES.minie,
  }),
  project('armstrong_gun', '阿姆斯特朗后装线膛炮', 'artillery', 6, ['forged_gun_body', 'precision_tools', 'rifling'], {
    description: '早期阿姆斯特朗炮是采用熟铁组合炮身的后装线膛炮，出现于19世纪中叶。',
    benefits: '完成即列装阿姆斯特朗炮；终局同时要求配套弹药与炮兵训练。', tags: ['制式军械', '后装线膛', '熟铁'], transfers: { cannon: 10, breech_actions: 15, napoleon_gun: 8 },
    technical: '组合炮身、膛线和尾部装填机构共同构成其结构特点；炮尾密封、机构维护和配套弹药影响使用可靠性。',
    historical: '英国在1850年代末采用阿姆斯特朗火炮。这一时期的熟铁后装炮，与后来以钢为主要材料的火炮有所区别。', source: SOURCES.armstrong,
  }),
  project('breech_rifle', '制式后装线膛步枪', 'smallarms', 7, ['breech_actions', 'minie_rifle'], {
    description: '后装线膛步枪从枪尾装入弹药，并以膛线赋予弹丸旋转，便于重复装填。',
    benefits: '完成即列装后装步枪；金属定装弹是独立的配套科技。', tags: ['制式军械', '后装线膛', '精密军械'], transfers: { minie_rifle: 20, cavalry_gun: 10 },
    technical: '尾部装填减少长距离推送弹丸的动作，但要求可靠的闭锁、密封与退壳；不同枪机结构各有复杂程度与特点。',
    historical: '19世纪后半叶，多国军队转向后装步枪。美国1865年采用的阿林改装方案，是利用旧式前装枪转型的实例。', source: SOURCES.breechloader,
  }),
  project('metal_cartridges', '金属定装弹量产', 'smallarms', 7, ['cartridge_cases', 'percussion_caps', 'quality_control'], {
    description: '金属定装弹把弹丸、发射药与点火部件组合在金属弹壳中，便于整体装填。',
    benefits: '完成后装步枪路线的弹药要求；与枪械完成联合供军。', tags: ['配套弹药', '金属定装弹', '量产'], transfers: { mass_production: 15, minie_ammo: 8 },
    technical: '弹壳同时承担容纳、保护与密封作用；统一规格涉及外形、材料及点火可靠性，并须与具体枪械相适应。',
    historical: '金属定装弹在19世纪逐步发展和普及。美国南北战争之后的步枪改装，也推动了军队采用这种弹药。', source: SOURCES.breechloader,
  }),
  project('joint_trials', '新军守京', 'army', 8, ['mass_production', 'logistics', 'officer_school'], {
    layoutPrerequisites: ['minie_rifle', 'minie_ammo', 'napoleon_gun', 'artillery_supply', 'armstrong_gun', 'rifled_shells', 'breech_rifle', 'metal_cartridges'],
    description: '都城防御依赖部队、工事、军械和补给协同，须兼顾城防与外围行动。',
    benefits: '两条战线评分达标即自动胜利，无需另行投入或验收。', tags: ['自动达成', '最终胜利', '两线守京'],
    automatic: true, cost: 0, testCost: 0, prestige: 0, minimum: 0, work: 1,
    technical: '兵力数量不能代替指挥和训练，精良军械也依赖稳定补给；守军需要维持纪律、预备力量与各部通信。',
    historical: '明代军事著作已把练兵、治械和阵法联系讨论。城防长期涉及军事组织、工程设施与物资储备的共同运作。', source: SOURCES.qijiguang,
  }),
];

export const TECH_CATEGORIES = [
  {id:'industry',name:'工业',description:'扩充供军数量，同类工艺只取最高贡献。',color:'#8f7544'},
  {id:'arms',name:'军械',description:'武器与弹药成套发挥效力，按军队方略选用。',color:'#936146'},
  {id:'army',name:'军制',description:'建立操典、军官与后勤，释放训练潜力。',color:'#617549'},
];
export const SPECIALTIES = [{id:'math',name:'数学'},{id:'metallurgy',name:'冶金'},{id:'mechanics',name:'机械'},{id:'foreign',name:'洋务'},{id:'military',name:'军事'},{id:'management',name:'管理'}];
export const DOCTRINES = [
  {id:'cold',name:'冷兵器大军',description:'以充足的铁器、甲具和工业供给武装大军，靠数量与纪律抵挡两路强敌。',branch:'infantry',quantityFactor:3.2,frontModifiers:{li:1.12,qing:1},equipmentFamily:'cold_equipment'},
  {id:'cuirassier',name:'胸甲骑兵',description:'集中精良甲具与训练，组建冲击力强的骑兵军团。',branch:'cavalry',quantityFactor:1.45,frontModifiers:{li:1.1,qing:1.18},equipmentFamily:'cavalry'},
  {id:'minie',name:'精锐火枪军',description:'缩小军队规模，以成套火枪弹药和严格操练提高战斗效能。',branch:'infantry',quantityFactor:1.05,frontModifiers:{li:1.15,qing:1.25},equipmentFamily:'firearms'},
  {id:'breech',name:'后装精兵',description:'进一步集中供给与训练，适合高效后装火器，亦可暂用较早制式。',branch:'infantry',quantityFactor:.9,frontModifiers:{li:1.35,qing:1.5},equipmentFamily:'firearms'},
];
// Retained export for consumers that enumerate strategic choices.
export const ROUTES = DOCTRINES;
export const FAMILIES = [
 ['survey','矿料勘察'],['education','工匠教育'],['standards','度量标准'],['power','动力'],['casting','铸造'],['iron','炼铁'],['fuel','燃料'],['malleable','熟铁'],['steel','炼钢'],['rolling','轧制'],['machine','母机'],['quality','检验'],['precision','精密工具'],['production','生产组织'],['cold_equipment','冷兵器与甲具'],['firearms','步兵枪械'],['powder','火药供给'],['ammunition','步兵弹药'],['percussion','击发工艺'],['rifling','线膛加工'],['cavalry','骑兵装备'],['artillery','火炮'],['artillery_ammo','炮兵弹药'],['carriages','炮架'],['gun_body','炮身'],['cases','弹壳'],['breech','后装机构'],['drill','操典'],['officers','军官'],['logistics','后勤'],['repairs','维修'],['victory','守京']
].map(([id,name])=>({id,name}));
export const MILESTONES = [
 {id:'foundations',name:'百工立基',description:'勘明原料、统一尺度，工业计划由纸面落地。',requirements:[{family:'survey',minLevel:1},{family:'standards',minLevel:1}],facilityRequirements:['workshop']},
 {id:'ironworking',name:'铁料可用',description:'任一种炼铁法验收即可开启铁器与母机；以后仍可补研更强炼铁法。',requirements:[{family:'iron',minLevel:1}],facilityRequirements:[]},
 {id:'machine_age',name:'母机入厂',description:'初代母机与军器工场结合，打开加工与规模生产。',requirements:[{family:'machine',minLevel:1}],facilityRequirements:['machine_shop']},
 {id:'precision',name:'精工成法',description:'较强母机与成品检验具备后，开展线膛、击发与精密配合。',requirements:[{family:'machine',minLevel:2},{family:'quality',minLevel:1}],facilityRequirements:['machine_shop']},
 {id:'powder_age',name:'火药成制',description:'火药定额与库务验收，让火器和弹药项目有可靠基础。',requirements:[{family:'powder',minLevel:1}],facilityRequirements:[]},
 {id:'steelworks',name:'钢料可用',description:'工具钢或规模炼钢均可打开钢制甲具与精密工具。',requirements:[{family:'steel',minLevel:1}],facilityRequirements:['furnace']},
 {id:'organization',name:'新军立制',description:'操典与固定营地齐备，开始持续练军、军官培养和军需建设。',requirements:[{family:'drill',minLevel:1}],facilityRequirements:['drill_ground']},
 {id:'rifled_arms',name:'击发线膛',description:'线膛与击发工艺汇合，可发展米尼步枪及其配套弹药。',requirements:[{family:'rifling',minLevel:1},{family:'percussion',minLevel:1}],facilityRequirements:['machine_shop']},
];
const EXTRA = [
 project('bloomery','土法块炼铁','metallurgy',1,[],{description: '块炼铁在铁尚未完全熔化时得到含渣铁块，是历史悠久的直接炼铁方法。',technical: '铁块中的炉渣和孔隙需要在后续整炼中减少；材料性质容易出现差异，生产通常依赖较多熟练劳动。', historical: '块炼法在古代多地广泛使用。高炉兴起后，它仍在部分地区延续，并未在同一时期被统一替代。', source: SOURCES.archaeometallurgy,tags:['起步炼铁','小炉'],work:1}),
 project('arsenal_workshops','分工军器作坊','machinery',3,[],{description: '分工军器作坊将制造任务分配给不同工匠或工房，由专人负责衔接与检查。',technical: '专业分工有利于积累熟练度，但各处尺度和交接标准不一时，成品仍需修配，运输和等待也会消耗时间。', historical: '大型官营作坊很早就存在工种分工。近代军器厂进一步集中机器、量具与检验，逐步改变传统作坊组织。', source: SOURCES.armory,tags:['生产组织','分工'],work:2}),
 project('steel_arms','钢制刀矛与板甲','smallarms',4,[],{description: '钢制刀矛与板甲利用钢材的强度和韧性，承担近战与身体防护功能。',technical: '刃具和甲片的受力方式不同，对硬度、韧性与重量各有要求；优质材料仍须配合合理结构和可靠制作。', historical: '钢制兵器和板甲在火器普及后仍继续使用。部分护甲加厚以应对枪弹，也因此面临重量与防护范围的取舍。', source: SOURCES.armor,tags:['冷兵器','钢甲'],work:2}),
 project('cuirassier','制式胸甲骑兵装具','smallarms',4,[],{description: '胸甲骑兵以躯干护甲、骑兵刀与马具为主要装具，是欧洲重骑兵的一种形态。',technical: '胸甲把防护集中在要害部位，减轻全身护甲的负担；骑乘活动与长途行军仍受装具重量、马匹和维护条件影响。', historical: '近代胸甲骑兵长期承担骑兵任务，部分部队也使用火器。随着步兵火力增强，重骑兵的战场地位逐渐变化。', source: SOURCES.cavalry,tags:['骑兵','胸甲'],work:2}),
];
// family, level, industrial capacity, equipment coefficient, milestone gates, direct prerequisites.
const SPEC = {
 survey:['survey',1,0,0,[],[]],school:['education',1,4,0,[],[]],standards:['standards',1,4,0,[],[]],water_power:['power',1,8,0,[],[]],
 bloomery:['iron',1,14,0,['foundations'],[]],iron:['iron',2,27,0,['foundations'],[]],coking:['fuel',1,5,0,['foundations'],[]],coke_furnace:['iron',3,42,0,['foundations'],['coking']],hot_blast:['iron',4,58,0,['ironworking'],['coking']],
 wrought_iron:['malleable',1,6,0,['ironworking'],[]],crucible_steel:['steel',1,10,0,['ironworking'],['wrought_iron']],bessemer_steel:['steel',2,25,0,['precision'],['coking']],rolling_mill:['rolling',1,15,0,['ironworking'],['wrought_iron','water_power']],
 lathe:['machine',1,12,0,['ironworking'],[]],boring_machine:['machine',2,22,0,['machine_age'],[]],planer:['machine',3,30,0,['machine_age'],[]],standard_tools:['machine',4,45,0,['precision'],['school']],quality_control:['quality',1,10,0,['machine_age'],[]],precision_tools:['precision',1,15,0,['precision','steelworks'],[]],
 civil_works:['production',1,22,0,['ironworking'],[]],arsenal_workshops:['production',2,45,0,['machine_age'],[]],mass_production:['production',3,70,0,['precision'],['school']],
 cold_arms:['cold_equipment',1,0,1.15,['ironworking'],[]],steel_arms:['cold_equipment',2,0,1.65,['steelworks'],[]],matchlock:['firearms',1,0,1.45,['ironworking','powder_age'],[]],muskets:['firearms',2,0,1.85,['machine_age','powder_age'],[]],percussion_musket:['firearms',3,0,2.25,['precision','powder_age'],['percussion_caps']],minie_rifle:['firearms',4,0,3.2,['rifled_arms'],[]],breech_rifle:['firearms',5,0,4.2,['rifled_arms'],['breech_actions']],
 powder_supply:['powder',1,0,0,['foundations'],[]],paper_cartridges:['ammunition',1,0,0,['powder_age'],[]],minie_ammo:['ammunition',2,0,0,['rifled_arms'],['paper_cartridges']],metal_cartridges:['ammunition',3,0,0,['rifled_arms'],['cartridge_cases']],percussion_caps:['percussion',1,0,0,['precision','powder_age'],[]],rifling:['rifling',1,0,0,['precision'],[]],cartridge_cases:['cases',1,0,0,['precision','steelworks'],['rolling_mill']],breech_actions:['breech',1,0,0,['precision'],['precision_tools','percussion_caps']],
 cavalry_gun:['cavalry',1,0,1.8,['machine_age','organization','powder_age'],['paper_cartridges']],cuirassier:['cavalry',2,0,2.5,['steelworks','organization'],[]],
 bronze_foundry:['casting',1,8,0,['foundations'],[]],cannon:['artillery',1,0,1,['ironworking','powder_age'],[]],napoleon_gun:['artillery',2,0,1.8,['precision'],['bronze_foundry','gun_carriages']],armstrong_gun:['artillery',3,0,2.8,['rifled_arms'],['forged_gun_body','precision_tools']],artillery_supply:['artillery_ammo',1,0,0,['powder_age'],[]],rifled_shells:['artillery_ammo',2,0,0,['rifled_arms'],['artillery_supply']],gun_carriages:['carriages',1,0,0,['ironworking','organization'],[]],forged_gun_body:['gun_body',1,0,0,['precision','steelworks'],['rolling_mill']],
 drill_manual:['drill',1,0,0,[],['school']],officer_school:['officers',1,0,0,['organization'],['school']],logistics:['logistics',1,0,0,['organization'],[]],repair_corps:['repairs',1,0,0,['machine_age','organization'],['logistics']],joint_trials:['victory',1,0,0,[],[]],
};
const FACILITY_REQUIREMENTS = {survey:['workshop'],school:['workshop'],standards:['workshop'],water_power:['workshop'],bloomery:['workshop'],drill_manual:['workshop'],iron:['furnace'],coking:['furnace'],coke_furnace:['furnace'],hot_blast:['furnace'],wrought_iron:['furnace'],crucible_steel:['furnace'],bessemer_steel:['furnace']};
const SKILL_OVERRIDES = {
 survey:{metallurgy:2,management:2,math:1},school:{management:3,foreign:2,math:1},standards:{math:3,mechanics:1},water_power:{mechanics:2,foreign:3},
 lathe:{mechanics:3,foreign:3,math:1},coking:{metallurgy:3,foreign:2},iron:{metallurgy:3,foreign:1},
 boring_machine:{math:3,mechanics:3},planer:{math:3,mechanics:3},standard_tools:{math:4,mechanics:3},precision_tools:{math:4,mechanics:3},rifling:{math:4,mechanics:3},
 civil_works:{management:4,mechanics:1},arsenal_workshops:{management:4,mechanics:2},mass_production:{management:5,mechanics:1},quality_control:{math:3,management:3},
 minie_rifle:{math:3,mechanics:3,military:2},breech_rifle:{math:4,mechanics:3,military:2},armstrong_gun:{math:4,mechanics:3,metallurgy:2,military:1},
 breech_actions:{math:4,mechanics:3},cartridge_cases:{math:3,mechanics:3},metal_cartridges:{management:3,math:2,mechanics:2},
};
const SKILLS = {metallurgy:{metallurgy:3,math:1,management:1},machinery:{mechanics:3,math:2,management:1},smallarms:{mechanics:2,foreign:2,military:1},artillery:{metallurgy:2,mechanics:2,foreign:1},army:{military:3,management:2}};
export const PROJECTS = [...CATALOG,...EXTRA].map(item=>{
 const [family,level,capacity,equipment,milestoneRequirements,prerequisites]=SPEC[item.id];
 const familyName=FAMILIES.find(f=>f.id===family)?.name||'铸造';
 const contribution=item.id==='repair_corps'?'军中修械队使每次训练从25提高至30，换装仍保留训练成果。':capacity?`${familyName}供军产能 +${capacity}；同类取最高，不叠加。`:equipment?`${familyName}装备效能 ${equipment.toFixed(2)}；同类取最高，枪炮需配套弹药。`:item.id==='joint_trials'?'对李自成与清军两战线评分均达100，即刻获胜。':`${familyName}等级 ${level}；用于里程碑、配套或训练条件，同类取最高。`;
 return {...item,era:item.id==='joint_trials'?9:Math.max(0,Math.min(8,level+milestoneRequirements.length)),family,familyName,level,capacity,equipment,contribution,benefits:contribution,milestoneRequirements,prerequisites,prerequisiteAny:[],facilityRequirements:FACILITY_REQUIREMENTS[item.id]||[],specialtyRequirements:SKILL_OVERRIDES[item.id]||SKILLS[item.branch],work:item.id==='joint_trials'?1:Math.min(item.work,2),...(item.id==='joint_trials'?{tags:['两路守京','自动达成'],layoutPrerequisites:[]}:{}),transfers:Object.fromEntries(Object.entries(item.transfers||{}).filter(([id])=>id!==item.id))};
});
const FACILITY_CATALOG = [
 {id:'workshop',name:'基础工坊',icon:'坊',cost:16000,prerequisites:[],milestoneRequirements:[],description:'整备工位与试制场地，开启勘察、量具和初期工艺。'},
 {id:'furnace',name:'炼铁炉场',icon:'炉',cost:30000,prerequisites:['water_power'],milestoneRequirements:['foundations'],description:'营建山麓炉群，允许采用规模炼铁、熟铁与炼钢工艺。'},
 {id:'machine_shop',name:'军器工场',icon:'机',cost:48000,prerequisites:['lathe'],milestoneRequirements:[],description:'母机入厂后打开加工、检验与分工生产里程碑。'},
 {id:'drill_ground',name:'演武场',icon:'营',cost:28000,prerequisites:['drill_manual'],milestoneRequirements:[],description:'与操典共同构成新军立制里程碑，允许持续练兵。'},
];
export const FACILITIES=FACILITY_CATALOG.map(f=>({...f,prerequisiteAny:[],unlocks:PROJECTS.filter(p=>p.facilityRequirements.includes(f.id)||p.milestoneRequirements.some(id=>MILESTONES.find(m=>m.id===id).facilityRequirements.includes(f.id))).map(p=>p.id)}));
