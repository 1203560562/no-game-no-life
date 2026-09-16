/**
 * Live2D 形象注册表 / 选择持久化 / 宝箱解锁系统
 *
 * 模型来源：
 * - haru / hiyori / mao / wanko：Live2D 官方免费示例（Cubism 4，官方开源许可）
 * - shizuku / koharu / unitychan / haruto：
 *   Cubism 2 经典示例（live2d-widget-models npm 包分发，仅限个人本地使用）
 * - bronya / kiana / himeko：崩坏学园2（Cubism 2，游戏提取资源，仅限个人本地使用）
 * - kp31 / ump9 / g36 / welrod 等 12 款：少女前线（Cubism 2，游戏提取资源，同上，
 *   来自 evrstr/live2d-widget-models 收藏仓库，仅限个人本地使用）
 * - tsubaki / alexia / aniya / nicole / tingyun / fuxuan / jingliu /
 *   changli / ruanmei：本地收录包（moc3 v4/v5，个人收藏，仅限个人本地使用）
 * - al_* 35 款：碧蓝航线日服（Cubism 3，游戏提取资源，来自 imuncle/live2d
 *   收藏仓库，仅限个人本地使用）。
 *   注：宁海/平海/圣路易斯·改 3 款因模型自身缺陷（idle 动作隐藏人物、
 *   部件渲染异常）未收录，资源保留在 public/live2d/ 对应目录。
 *
 * 注：官方示例 Ren（莲）为 moc3 v6 存档，仅 Cubism Core 6 可加载；
 * 公共 CDN（cubism.live2d.com）分发的 Core 最新为 5.0，故暂不注册。
 * 资源保留在 public/live2d/ren/，待官方 CDN 更新 Core 6 后可恢复。
 *
 * 带 chestRarity 的形象初始锁定，双渠道解锁：
 * - 升级宝箱开出（chestRarity 决定掉落档位，权重低于同档装备）
 * - 商店金币购买（shopPrice 决定售价）
 * 不设 chestRarity 的形象（haru / hiyori）永久免费可用。
 */

import { WARDROBE_OUTFIT_DEFS } from './wardrobeOutfits'

export interface OutfitDef {
  id: string
  /** 展示名 */
  label: string
  /** 展示 emoji */
  icon?: string
  /** 贴图 URL（与模型原贴图同尺寸同 UV 布局） */
  texture: string
  /** 替换 model3.json Textures 数组的第几张（0 起） */
  textureIndex: number
  /** 解锁所需商店道具 id（加入 player.unlockedItems 即解锁）；缺省免费可用 */
  unlockItem?: string
}

export interface Live2DModelDef {
  id: string
  /** 展示名（不含 emoji） */
  label: string
  /** 展示 emoji（滚轮/卡片/切换器用） */
  icon: string
  /** model.json / model3.json 入口 */
  url: string
  /** 待机动作组（aqua 的组名为空字符串） */
  idleGroup: string
  /** Cubism 版本（展示用） */
  cubism: 2 | 3 | 4
  /** 欢呼/施法姿态触发的表情名（无表情组则留空） */
  expCheer?: string
  expCast?: string
  /** 宝箱限定稀有度：设置后初始锁定，开宝箱/商店购买解锁 */
  chestRarity?: 'blue' | 'purple' | 'gold' | 'red'
  /** 商店售价（金币）；与 chestRarity 配套，缺省视为非卖品（仅抽奖） */
  shopPrice?: number
  /** 视图微调：适配缩放倍率（1=默认；>1 放大，如斯佩伯爵人物纤细 viewZoom:2） */
  viewZoom?: number
  /** 视图微调：水平偏移（画框宽度比例，正值右移；如吸血鬼待机姿态偏左） */
  viewOffsetX?: number
  /** 视图微调：垂直偏移（画框高度比例，正值下移） */
  viewOffsetY?: number
  /** 锁定取景：idle 动作摆幅大的模型（如阿尔及利亚）任何延迟采样都会命中随机姿态帧
   *  （挥臂/跨步帧包围盒偏大 → 重适配瞬间人物突然缩小），开启后直接冻结加载瞬间
   *  的默认站姿包围盒（resize 复用同一基准），大小位置恒定 */
  lockFit?: boolean
  /** 换装系统：可替换贴图组（第一套为默认）。贴图须与原贴图同尺寸同 UV 布局 */
  outfits?: OutfitDef[]
}

const MODEL_DEFS: Live2DModelDef[] = [
  // ===== 免费形象（默认可用） =====
  { id: 'haru',    label: 'Haru',    icon: '🎧', url: '/live2d/haru/haru_greeter_t03.model3.json',   idleGroup: 'Idle', cubism: 4, expCheer: 'f02', expCast: 'f04' },
  { id: 'hiyori',  label: '日和',    icon: '🎀', url: '/live2d/hiyori/Hiyori.model3.json',            idleGroup: 'Idle', cubism: 4 },
  { id: 'hiyori-wardrobe', label: '日和·衣橱', icon: '👗', url: '/live2d/hiyori-wardrobe/Hiyori.model3.json', idleGroup: 'Idle', cubism: 4,
    outfits: WARDROBE_OUTFIT_DEFS },
  // ===== 官方 Cubism 4 示例（高画质，抽奖/商店解锁） =====
  { id: 'mao',     label: '猫娘Mao', icon: '🐱', url: '/live2d/mao/Mao.model3.json',                  idleGroup: 'Idle', cubism: 4, expCheer: 'exp_02', expCast: 'exp_04', chestRarity: 'purple', shopPrice: 6000 },
  { id: 'wanko',   label: '汪汪',    icon: '🐕', url: '/live2d/wanko/Wanko.model3.json',              idleGroup: 'Idle', cubism: 4, chestRarity: 'purple', shopPrice: 5000 },
  // ===== Cubism 2 经典示例（live2d-widget-models，抽奖/商店解锁） =====
  { id: 'shizuku', label: '雫',      icon: '🌸', url: '/live2d/shizuku/shizuku.model.json',           idleGroup: 'idle', cubism: 2, expCheer: 'f02', expCast: 'f03', chestRarity: 'blue', shopPrice: 1800 },
  { id: 'koharu',  label: '小春',    icon: '🌺', url: '/live2d/koharu/koharu.model.json',             idleGroup: 'idle', cubism: 2, chestRarity: 'blue', shopPrice: 2000 },
  { id: 'unitychan', label: 'Unity娘', icon: '🍊', url: '/live2d/unitychan/unitychan.model.json',     idleGroup: 'idle', cubism: 2, chestRarity: 'blue', shopPrice: 2600 },
  { id: 'haruto',  label: '春人',    icon: '🌙', url: '/live2d/haruto/haruto.model.json',             idleGroup: 'idle', cubism: 2, chestRarity: 'blue', shopPrice: 2000 },
  // ===== 宝箱限定（游戏提取资源，抽奖/商店解锁） =====
  { id: 'bronya',  label: '布洛妮娅', icon: '🐰', url: '/live2d/bronya/model.json',                   idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'kiana',   label: '琪亚娜',  icon: '⚔️', url: '/live2d/kiana/model.json',                    idleGroup: 'idle', cubism: 2, chestRarity: 'gold', shopPrice: 10000 },
  { id: 'himeko',  label: '姬子',    icon: '🔥', url: '/live2d/himeko/model.json',                    idleGroup: 'idle', cubism: 2, chestRarity: 'gold', shopPrice: 10000 },
  // ===== 少女前线（Cubism 2，游戏提取资源，抽奖/商店解锁） =====
  { id: 'kp31',    label: 'KP31',    icon: '🔫', url: '/live2d/kp31/model.json',                     idleGroup: 'idle', cubism: 2, chestRarity: 'gold',   shopPrice: 10000 },
  { id: 'welrod',  label: '维尔德',  icon: '🎯', url: '/live2d/welrod/model.json',                   idleGroup: 'idle', cubism: 2, chestRarity: 'gold',   shopPrice: 10000 },
  { id: 'ump9',    label: 'UMP9',    icon: '🍭', url: '/live2d/ump9/model.json',                     idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'g36',     label: 'G36',     icon: '🎀', url: '/live2d/g36/model.json',                      idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5200 },
  { id: 'grizzly', label: '灰熊',    icon: '🐻', url: '/live2d/grizzly/model.json',                  idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'type95',  label: '95式',    icon: '⭐', url: '/live2d/type95/model.json',                   idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5600 },
  { id: 'ntw20',   label: 'NTW-20',  icon: '💥', url: '/live2d/ntw20/model.json',                    idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5600 },
  { id: 'dsr50',   label: 'DSR-50',  icon: '☕', url: '/live2d/dsr50/model.json',                    idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5800 },
  { id: 'k2',      label: 'K2',      icon: '🌙', url: '/live2d/k2/model.json',                       idleGroup: 'idle', cubism: 2, chestRarity: 'blue',   shopPrice: 3200 },
  { id: 'pkp',     label: 'PKP',     icon: '🔥', url: '/live2d/pkp/model.json',                      idleGroup: 'idle', cubism: 2, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'ots14',   label: 'OTS-14',  icon: '🌊', url: '/live2d/ots14/model.json',                    idleGroup: 'idle', cubism: 2, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'thompson', label: '汤姆斯', icon: '🥤', url: '/live2d/thompson/model.json',                 idleGroup: 'idle', cubism: 2, chestRarity: 'blue',   shopPrice: 3000 },
  // ===== 本地收录（moc3 v4/v5，抽奖/商店解锁） =====
  { id: 'tsubaki', label: '椿',     icon: '💐', url: '/live2d/tsubaki/tsubaki.model3.json',    idleGroup: '', cubism: 4, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'alexia',  label: 'Alexia', icon: '🦊', url: '/live2d/alexia/Alexia.model3.json',     idleGroup: '', cubism: 4, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'aniya',   label: 'ANIYA',  icon: '🎭', url: '/live2d/aniya/ANIYA.model3.json',       idleGroup: '', cubism: 4, chestRarity: 'red',    shopPrice: 15000 },
  { id: 'nicole',  label: '妮可',   icon: '🛼', url: '/live2d/nicole/Nicole.model3.json',      idleGroup: '', cubism: 4, chestRarity: 'gold',   shopPrice: 10000 },
  { id: 'tingyun', label: '停云',   icon: '☁️', url: '/live2d/tingyun/tingyun.model3.json',    idleGroup: '', cubism: 4, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'fuxuan',  label: '符玄',   icon: '🔮', url: '/live2d/fuxuan/fuxuan.model3.json',      idleGroup: '', cubism: 4, chestRarity: 'gold',   shopPrice: 10000 },
  { id: 'jingliu', label: '镜流',   icon: '❄️', url: '/live2d/jingliu/jingliu.model3.json',    idleGroup: '', cubism: 4, chestRarity: 'gold',   shopPrice: 10000 },
  { id: 'changli', label: '长离',   icon: '🦚', url: '/live2d/changli/changli.model3.json',    idleGroup: '', cubism: 4, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'ruanmei', label: '阮梅',   icon: '🧧', url: '/live2d/ruanmei/ruanmei.model3.json',    idleGroup: '', cubism: 4, chestRarity: 'gold',   shopPrice: 10000 },
  // ===== 碧蓝航线（Cubism 3，imuncle/live2d 收录，抽奖/商店解锁） =====
  { id: 'al_aidang_2',          label: '爱宕',           icon: '🍇', url: '/live2d/al_aidang_2/aidang_2.model3.json',               idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_aierdeliqi_4',      label: '阿尔及利亚',     icon: '🌙', url: '/live2d/al_aierdeliqi_4/aierdeliqi_4.model3.json',       idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000, lockFit: true },
  { id: 'al_aierdeliqi_5',      label: '阿尔及利亚·改',  icon: '🌙', url: '/live2d/al_aierdeliqi_5/aierdeliqi_5.model3.json',       idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3200, lockFit: true },
  { id: 'al_aimierbeierding_2', label: '埃米尔·贝尔坦',  icon: '🍰', url: '/live2d/al_aimierbeierding_2/aimierbeierding_2.model3.json', idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_banrenma_2',        label: '半人马',         icon: '🏹', url: '/live2d/al_banrenma_2/banrenma_2.model3.json',           idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3200 },
  { id: 'al_beierfasite_2',     label: '贝尔法斯特',     icon: '🍷', url: '/live2d/al_beierfasite_2/beierfasite_2.model3.json',     idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_biaoqiang_3',       label: '标枪·改',        icon: '🗡️', url: '/live2d/al_biaoqiang_3/biaoqiang_3.model3.json',         idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000 },
  { id: 'al_bisimai_2',         label: '俾斯麦',         icon: '⚓', url: '/live2d/al_bisimai_2/bisimai_2.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_chuixue_3',         label: '吹雪',           icon: '❄️', url: '/live2d/al_chuixue_3/chuixue_3.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2600 },
  { id: 'al_dafeng_2',          label: '大凤',           icon: '🐦', url: '/live2d/al_dafeng_2/dafeng_2.model3.json',               idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_deyizhi_3',         label: '德意志',         icon: '🦅', url: '/live2d/al_deyizhi_3/deyizhi_3.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000 },
  { id: 'al_dujiaoshou_4',      label: '独角兽',         icon: '🦄', url: '/live2d/al_dujiaoshou_4/dujiaoshou_4.model3.json',       idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3200 },
  { id: 'al_dunkeerke_2',       label: '敦刻尔克',       icon: '⚓', url: '/live2d/al_dunkeerke_2/dunkeerke_2.model3.json',         idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_genaisennao_2',     label: '根纳森瑙',       icon: '⚓', url: '/live2d/al_genaisennao_2/genaisennao_2.model3.json',     idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_heitaizi_2',        label: '黑太子',         icon: '🖤', url: '/live2d/al_heitaizi_2/heitaizi_2.model3.json',           idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_huangjiafangzhou_3', label: '皇家方舟',      icon: '🏴', url: '/live2d/al_huangjiafangzhou_3/huangjiafangzhou_3.model3.json', idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'al_huonululu_3',       label: '火奴鲁鲁',       icon: '🌺', url: '/live2d/al_huonululu_3/huonululu_3.model3.json',         idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2600 },
  { id: 'al_huonululu_5',       label: '火奴鲁鲁·改',    icon: '🌺', url: '/live2d/al_huonululu_5/huonululu_5.model3.json',         idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_kelifulan_3',       label: '克利夫兰',       icon: '🎷', url: '/live2d/al_kelifulan_3/kelifulan_3.model3.json',         idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'al_lafei',             label: '拉菲',           icon: '🐰', url: '/live2d/al_lafei/lafei.model3.json',                     idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_lafei_4',           label: '拉菲·改',        icon: '🐰', url: '/live2d/al_lafei_4/lafei_4.model3.json',                 idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6200 },
  { id: 'al_lingbo',            label: '绫波',           icon: '🌊', url: '/live2d/al_lingbo/lingbo.model3.json',                   idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_qibolin_2',         label: '齐柏林',         icon: '✈️', url: '/live2d/al_qibolin_2/qibolin_2.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'al_shengluyisi_2',     label: '圣路易斯',       icon: '🎺', url: '/live2d/al_shengluyisi_2/shengluyisi_2.model3.json',     idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000 },
  { id: 'al_sipeibojue_5',      label: '斯佩伯爵',       icon: '🚢', url: '/live2d/al_sipeibojue_5/sipeibojue_5.model3.json',       idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2800, viewZoom: 2 },
  { id: 'al_taiyuan_2',         label: '太原',           icon: '🏮', url: '/live2d/al_taiyuan_2/taiyuan_2.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 2600 },
  { id: 'al_tianlangxing_3',    label: '天狼星',         icon: '🌟', url: '/live2d/al_tianlangxing_3/tianlangxing_3.model3.json',   idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'al_tierbici_2',        label: '提尔比茨',       icon: '⚡', url: '/live2d/al_tierbici_2/tierbici_2.model3.json',           idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_xianghe_2',         label: '翔鹤',           icon: '🕊️', url: '/live2d/al_xianghe_2/xianghe_2.model3.json',             idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'al_xixuegui_4',        label: '吸血鬼',         icon: '🧛', url: '/live2d/al_xixuegui_4/xixuegui_4.model3.json',           idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000, viewOffsetX: 0.07, viewOffsetY: -0.08 },
  { id: 'al_xuefeng',           label: '雪风',           icon: '🌨️', url: '/live2d/al_xuefeng/xuefeng.model3.json',                 idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'al_yichui_2',          label: '伊吹',           icon: '🌸', url: '/live2d/al_yichui_2/yichui_2.model3.json',               idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3200 },
  { id: 'al_z23',               label: 'Z23',            icon: '📘', url: '/live2d/al_z23/z23.model3.json',                         idleGroup: 'Idle', cubism: 3, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'al_z46_2',             label: 'Z46',            icon: '📗', url: '/live2d/al_z46_2/z46_2.model3.json',                     idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3000 },
  { id: 'al_zhala_2',           label: '扎拉',           icon: '🍝', url: '/live2d/al_zhala_2/zhala_2.model3.json',                 idleGroup: 'Idle', cubism: 3, chestRarity: 'blue',   shopPrice: 3200 },
  // ===== imuncle Cubism 2 精选（同人/游戏提取，抽奖/商店解锁；来源见 scripts/download-imuncle-c2.mjs） =====
  { id: 'sagiri',   label: '和泉纱雾',   icon: '🎨', url: '/live2d/sagiri/sagiri.model.json',  idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 6000 },
  { id: 'violet',   label: '薇尔莉特',   icon: '💜', url: '/live2d/violet/14.json',            idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5000 },
  { id: 'yuri',     label: '尤莉',       icon: '🌼', url: '/live2d/yuri/model.json',           idleGroup: 'idle', cubism: 2, chestRarity: 'blue',   shopPrice: 2800 },
  { id: 'aoba',     label: '青叶',       icon: '⚓', url: '/live2d/aoba/2.json',               idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 5600 },
  { id: 'mashiro_ryoufuku', label: '真白·体操服', icon: '🎽', url: '/live2d/mashiro/ryoufuku.model.json', idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 6000, expCheer: 'f02.exp.json', expCast: 'f04.exp.json' },
  { id: 'mashiro_seifuku',  label: '真白·制服',   icon: '👗', url: '/live2d/mashiro/seifuku.model.json',  idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 6000, expCheer: 'f02.exp.json', expCast: 'f04.exp.json' },
  { id: 'mashiro_shifuku',  label: '真白·私服',   icon: '🧣', url: '/live2d/mashiro/shifuku.model.json',  idleGroup: 'idle', cubism: 2, chestRarity: 'purple', shopPrice: 6000, expCheer: 'f02.exp.json', expCast: 'f04.exp.json' },
  { id: 'kp31_310',          label: 'KP31·婚纱',   icon: '💍', url: '/live2d/kp31_310/normal/model.json',  idleGroup: 'idle', cubism: 2, chestRarity: 'gold',   shopPrice: 8000 },
  { id: 'kp31_310_destroy',  label: 'KP31·婚纱大破', icon: '💔', url: '/live2d/kp31_310/destroy/model.json', idleGroup: 'idle', cubism: 2, chestRarity: 'blue', shopPrice: 3000 },
]

export const DEFAULT_MODEL_ID = 'haru'

/**
 * 形象直售价 = 基准价 × 档位系数（v1.1 经济调整：中后期收入通胀，
 * 稀有度越高的形象越需要"攒一阵子"才买得起，形成攒钱目标）
 */
const MODEL_PRICE_TIERS: Record<NonNullable<Live2DModelDef['chestRarity']>, number> = {
  blue: 2,
  purple: 3,
  gold: 3,
  red: 3,
}

export const LIVE2D_MODELS: Live2DModelDef[] = MODEL_DEFS.map((m) =>
  m.shopPrice && m.chestRarity
    ? { ...m, shopPrice: Math.round((m.shopPrice * MODEL_PRICE_TIERS[m.chestRarity]) / 100) * 100 }
    : m,
)

// ===== 形象解锁（宝箱限定款；localStorage + 模块级订阅） =====

const UNLOCK_KEY = 'levelup.live2d.unlocked'

const readUnlocked = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

let unlocked = readUnlocked()
const unlockListeners = new Set<() => void>()

/** 已解锁的宝箱限定形象 id 快照（供 useSyncExternalStore） */
export const getUnlockedModels = (): string[] => unlocked

export const isModelUnlocked = (id: string): boolean => {
  const def = LIVE2D_MODELS.find((m) => m.id === id)
  return !def?.chestRarity || unlocked.includes(id)
}

/** 解锁宝箱限定形象（开出时调用），成功返回 true */
export const unlockModel = (id: string): boolean => {
  const def = LIVE2D_MODELS.find((m) => m.id === id)
  if (!def?.chestRarity || unlocked.includes(id)) return false
  unlocked = [...unlocked, id]
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked))
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  unlockListeners.forEach((l) => l())
  return true
}

export const subscribeModelUnlocks = (listener: () => void) => {
  unlockListeners.add(listener)
  return () => {
    unlockListeners.delete(listener)
  }
}

/** ===== 管理员测试接口（AdminPanel 专用） ===== */

/** 解锁全部宝箱限定形象 */
export const unlockAllModels = () => {
  for (const m of LIVE2D_MODELS) {
    if (m.chestRarity && !unlocked.includes(m.id)) unlocked = [...unlocked, m.id]
  }
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked))
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  unlockListeners.forEach((l) => l())
}

/** 重置形象解锁（清空宝箱限定解锁记录；若当前选中被锁形象会回退默认） */
export const resetUnlockedModels = () => {
  unlocked = []
  try {
    localStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  unlockListeners.forEach((l) => l())
  if (!isModelUnlocked(current)) {
    current = DEFAULT_MODEL_ID
    try {
      localStorage.setItem(STORAGE_KEY, current)
    } catch {
      /* 忽略 */
    }
    listeners.forEach((l) => l())
  }
}

// ===== 选择持久化（localStorage + 模块级订阅，供 useSyncExternalStore 使用） =====

const STORAGE_KEY = 'levelup.live2d.model'

const listeners = new Set<() => void>()

const readStored = (): string => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && LIVE2D_MODELS.some((m) => m.id === v) ? v : DEFAULT_MODEL_ID
  } catch {
    return DEFAULT_MODEL_ID
  }
}

let current = readStored()
// 选中的形象已锁定（如版本升级引入 chestRarity 后旧存档指向限定款）→ 回退默认
if (!isModelUnlocked(current)) current = DEFAULT_MODEL_ID

export const getModelChoice = (): string => current

/**
 * 选择形象。opts.force 用于商店试穿预览：允许临时切换到未解锁形象，
 * 刷新后由 readStored 的解锁校验自动回退默认（临时预览不持久化为解锁）。
 */
export const setModelChoice = (id: string, opts?: { force?: boolean }) => {
  if (!LIVE2D_MODELS.some((m) => m.id === id) || id === current) return
  if (!opts?.force && !isModelUnlocked(id)) return
  current = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  listeners.forEach((l) => l())
}

export const subscribeModelChoice = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ===== 换装：服饰选择持久化（按形象分别记忆，localStorage + 模块级订阅） =====

const OUTFIT_KEY = 'levelup.live2d.outfit'

const readOutfits = (): Record<string, string> => {
  try {
    const v = JSON.parse(localStorage.getItem(OUTFIT_KEY) ?? '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

let outfitChoices = readOutfits()
const outfitListeners = new Set<() => void>()

/** 当前形象选中的服饰 id（未配置/未选择 → 第一套；无服饰形象返回空串） */
export const getOutfitChoice = (modelId: string): string => {
  const def = LIVE2D_MODELS.find((m) => m.id === modelId)
  if (!def?.outfits?.length) return ''
  const chosen = outfitChoices[modelId]
  return def.outfits.some((o) => o.id === chosen) ? chosen : def.outfits[0].id
}

export const setOutfitChoice = (modelId: string, outfitId: string) => {
  const def = LIVE2D_MODELS.find((m) => m.id === modelId)
  if (!def?.outfits?.some((o) => o.id === outfitId)) return
  if (outfitChoices[modelId] === outfitId) return
  outfitChoices = { ...outfitChoices, [modelId]: outfitId }
  try {
    localStorage.setItem(OUTFIT_KEY, JSON.stringify(outfitChoices))
  } catch {
    /* 存储不可用时仅内存生效 */
  }
  outfitListeners.forEach((l) => l())
}

export const subscribeOutfitChoice = (listener: () => void) => {
  outfitListeners.add(listener)
  return () => {
    outfitListeners.delete(listener)
  }
}
