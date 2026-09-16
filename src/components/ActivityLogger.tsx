import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { ACTIVITY_TYPES, DOMAIN_META, SLEEP_PERIODS } from '../config/xpConfig'
import type { ActivityType, Intensity } from '../types'
import { parseNaturalLanguage, type ParsedActivity } from '../ai/nlParser'
import { detectMentalHealthMention, MENTAL_HEALTH_REDIRECT } from '../ai/safetyGuard'

const EXERCISE_SUBTYPES = [
  { id: 'badminton', label: '🏸 羽毛球' },
  { id: 'basketball', label: '🏀 篮球' },
  { id: 'running', label: '🏃 跑步' },
  { id: 'gym', label: '💪 健身' },
  { id: 'walk', label: '🚶 步行' },
  { id: 'cycle', label: '🚴 骑行' },
  { id: 'swim', label: '🏊 游泳' },
  { id: 'other', label: '🎯 其他' },
]

const MOOD_OPTIONS = [
  { v: 6, label: '😄 非常好' },
  { v: 5, label: '🙂 良好' },
  { v: 4, label: '😐 普通' },
  { v: 3, label: '😕 疲惫' },
  { v: 2, label: '😣 焦虑' },
  { v: 1, label: '😞 低落' },
]

/** Date → datetime-local 输入框值（YYYY-MM-DDTHH:mm） */
const toDatetimeLocal = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const ActivityLogger: React.FC<{ onClose: () => void; presetTitle?: string }> = ({ onClose, presetTitle }) => {
  const addActivity = useGameStore((s) => s.addActivity)
  const endSession = useGameStore((s) => s.endSession)
  const addMood = useGameStore((s) => s.addMood)
  const restMode = useGameStore((s) => s.state.restMode)
  /** 可关联的时间投入型里程碑（未完成领取的） */
  const timeMilestones = useGameStore((s) =>
    s.state.milestones.filter((m) => m.metric?.kind === 'time' && !m.finalClaimed),
  )
  const [milestoneIds, setMilestoneIds] = useState<string[]>([])

  const [type, setType] = useState<ActivityType | null>(null)
  const [title, setTitle] = useState(presetTitle ?? '')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<number>(30)
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [difficulty, setDifficulty] = useState(3)
  const [proactive, setProactive] = useState(false)
  const [isEscape, setIsEscape] = useState(false)
  const [subtype, setSubtype] = useState('other')
  /** 睡眠时段（早睡/正常/晚睡/熬夜），存入 Activity.subtype 驱动奖励系数 */
  const [sleepPeriod, setSleepPeriod] = useState('normal')
  /** 运动发生时间（补录打完球的时刻；BOSS 时段限制按此判定） */
  const [exerciseAt, setExerciseAt] = useState(() => toDatetimeLocal(new Date()))
  const [mood, setMood] = useState(4)
  const [moodContent, setMoodContent] = useState('')

  // 自然语言输入相关状态
  const [nlMode, setNlMode] = useState(false)
  const [nlInput, setNlInput] = useState('')
  const [nlParsing, setNlParsing] = useState(false)
  const [nlResult, setNlResult] = useState<ParsedActivity[] | null>(null)
  const [nlReply, setNlReply] = useState('')
  const [nlError, setNlError] = useState('')

  const state = useGameStore((s) => s.state)

  const reset = () => {
    setTitle(presetTitle ?? '')
    setDescription('')
    setDuration(30)
    setIntensity('medium')
    setDifficulty(3)
    setProactive(false)
    setIsEscape(false)
    setSubtype('other')
    setSleepPeriod('normal')
    setExerciseAt(toDatetimeLocal(new Date()))
    setMood(4)
    setMoodContent('')
  }

  const pickType = (t: ActivityType) => {
    setType(t)
    reset()
    if (t === 'exercise') setSubtype('badminton')
    // reset 默认 30 会被睡眠按小时解析成 30h（0 奖励），改为健康基准 8h
    if (t === 'sleep') setDuration(8)
  }

  const submit = () => {
    if (!type) return

    if (type === 'mental') {
      if (moodContent.trim()) {
        addMood(mood, moodContent.trim())
      }
      // 心理活动也走 addActivity，获得 mental 配置的 XP（base=15）+ 属性加成
      addActivity({
        type: 'mental',
        title: moodContent.trim() || DOMAIN_META.mental.label,
        intensity: mood <= 2 ? 'low' : mood <= 4 ? 'medium' : 'high',
      })
      onClose()
      return
    }

    const meta = DOMAIN_META[type]
    let finalTitle = title.trim()
    if (!finalTitle) {
      if (type === 'exercise') {
        finalTitle = EXERCISE_SUBTYPES.find((s) => s.id === subtype)?.label.replace(/^[^\s]+\s/, '') ?? '运动'
      } else if (type === 'sleep') {
        finalTitle = '睡眠'
      } else if (type === 'food') {
        finalTitle = '饮食记录'
      } else {
        finalTitle = meta.label
      }
    }

    // sleep uses hours via durationMinutes；时段存入 subtype（XP 奖励系数）
    const durationMinutes = type === 'sleep' ? Math.round(duration * 60) : duration

    // 运动/挑战走「局」结算链路（与番茄钟完全一致）：结算 Overlay + BOSS 伤害 +
    // 局档案计入今日局数；运动额外携带发生时间（BOSS 时段限制按此判定）
    if (type === 'exercise' || type === 'challenge') {
      // 发生时间缺省/清空时回退当前时刻（datetime-local 清空 → Invalid Date 防御）
      const occurredIso = exerciseAt
        ? new Date(exerciseAt).toISOString()
        : new Date().toISOString()
      endSession({
        type,
        title: finalTitle,
        plannedMinutes: durationMinutes,
        actualMinutes: durationMinutes,
        startTime: type === 'exercise' ? occurredIso : undefined,
        intensity,
        subtype: type === 'exercise' ? subtype : undefined,
        description: type === 'challenge' ? description.trim() || undefined : undefined,
        milestoneIds: milestoneIds.length > 0 ? milestoneIds : undefined,
        manual: true,
      })
      onClose()
      return
    }

    addActivity({
      type,
      title: finalTitle,
      description: description.trim() || undefined,
      durationMinutes,
      intensity,
      subtype: type === 'sleep' ? sleepPeriod : undefined,
      difficulty: type === 'work' || type === 'study' ? difficulty : undefined,
      proactive: type === 'work' || type === 'social' ? proactive : undefined,
      isEscape: type === 'game' ? isEscape : undefined,
      milestoneIds: milestoneIds.length > 0 ? milestoneIds : undefined,
    })
    onClose()
  }

  const needsTitle = type && type !== 'sleep' && type !== 'mental'
  const needsDuration = type && type !== 'food' && type !== 'mental'
  const needsIntensity = ['work', 'study', 'exercise', 'creative', 'challenge'].includes(type ?? '')
  const needsDifficulty = type === 'work' || type === 'study'
  const needsProactive = type === 'work' || type === 'social'
  const needsEscape = type === 'game'

  // ===== 自然语言解析 =====
  const handleNlParse = async () => {
    const input = nlInput.trim()
    if (!input) return

    // 心理健康安全检测
    if (detectMentalHealthMention(input)) {
      setNlReply(MENTAL_HEALTH_REDIRECT)
      setNlResult([])
      return
    }

    setNlParsing(true)
    setNlError('')
    setNlReply('')
    setNlResult(null)

    try {
      const result = await parseNaturalLanguage(state, input)
      if (result.error) {
        setNlError(result.error)
      }
      setNlReply(result.reply)
      setNlResult(result.activities)
    } catch (e) {
      setNlError(e instanceof Error ? e.message : '解析失败')
      setNlResult([])
    } finally {
      setNlParsing(false)
    }
  }

  const handleNlConfirm = () => {
    if (!nlResult || nlResult.length === 0) return
    for (const act of nlResult) {
      // 运动/挑战走局结算（与手动表单一致：结算 Overlay + BOSS 伤害）
      if ((act.type === 'exercise' || act.type === 'challenge') && (act.durationMinutes ?? 0) > 0) {
        endSession({
          type: act.type,
          title: act.title,
          plannedMinutes: act.durationMinutes!,
          actualMinutes: act.durationMinutes,
          intensity: act.intensity,
          subtype: act.subtype,
          description: act.description,
          manual: true,
        })
      } else {
        addActivity({
          type: act.type,
          title: act.title,
          description: act.description,
          durationMinutes: act.durationMinutes,
          intensity: act.intensity,
          subtype: act.subtype,
          difficulty: act.difficulty,
          proactive: act.proactive,
          isEscape: act.isEscape,
        })
      }
    }
    // 清理并关闭
    setNlMode(false)
    setNlInput('')
    setNlResult(null)
    setNlReply('')
    setNlError('')
    onClose()
  }

  const handleNlCancel = () => {
    setNlMode(false)
    setNlInput('')
    setNlResult(null)
    setNlReply('')
    setNlError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-in" onClick={onClose}>
      <div
        className="rpg-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="pixel-text text-sm text-rpg-gold">
            {restMode ? '记录（休息模式）' : '记录今日行动'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {!type && !nlMode && (
          <>
            {/* 自然语言输入入口 */}
            <button
              onClick={() => setNlMode(true)}
              className="mb-3 w-full rounded-lg border-2 border-rpg-xp/50 bg-rpg-xp/10 p-3 text-left transition-all hover:border-rpg-xp hover:bg-rpg-xp/20"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <div>
                  <div className="text-xs font-bold text-rpg-xp">智能记录</div>
                  <div className="text-[10px] text-gray-400">用自然语言描述，AI 自动解析</div>
                </div>
              </div>
            </button>

            {/* 手动选择类型 */}
            <div className="mb-2 text-[10px] text-gray-500">或手动选择类型</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ACTIVITY_TYPES.map((t) => {
                const m = DOMAIN_META[t]
                return (
                  <button
                    key={t}
                    onClick={() => pickType(t)}
                    className="rpg-panel-light flex flex-col items-center gap-1 p-3 transition-all hover:border-rpg-gold hover:bg-rpg-panel"
                  >
                    <span className="text-2xl">{m.icon}</span>
                    <span className="text-xs">{m.label}</span>
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* 自然语言输入模式 */}
        {!type && nlMode && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-rpg-xp">✨ 智能记录</span>
              <button onClick={handleNlCancel} className="text-xs text-gray-400 hover:text-white">
                返回
              </button>
            </div>

            <textarea
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              rows={3}
              placeholder="例如：今天打了2个半小时羽毛球，然后看了40分钟《被讨厌的勇气》"
              className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-3 text-sm focus:border-rpg-xp focus:outline-none"
              disabled={nlParsing}
            />

            <button
              onClick={handleNlParse}
              disabled={nlParsing || !nlInput.trim()}
              className="rpg-btn-primary w-full"
            >
              {nlParsing ? '解析中...' : '解析'}
            </button>

            {nlError && (
              <div className="rounded-lg border border-red-800/50 bg-red-900/10 p-2 text-[10px] text-red-400">
                {nlError}
              </div>
            )}

            {nlReply && (
              <div className="rounded-lg border border-rpg-border bg-rpg-panelLight/50 p-3 text-xs text-gray-300">
                {nlReply}
              </div>
            )}

            {/* 解析结果确认 */}
            {nlResult && nlResult.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] text-gray-500">解析到 {nlResult.length} 条活动，确认记录？</div>
                {nlResult.map((act, i) => (
                  <div key={i} className="rounded-lg border border-rpg-border bg-rpg-panel p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{DOMAIN_META[act.type]?.icon ?? '📝'}</span>
                      <div className="flex-1">
                        <div className="text-sm text-gray-200">{act.title}</div>
                        <div className="text-[10px] text-gray-500">
                          {DOMAIN_META[act.type]?.label ?? act.type}
                          {act.durationMinutes ? ` · ${act.durationMinutes}分钟` : ''}
                          {act.intensity ? ` · ${act.intensity === 'low' ? '轻松' : act.intensity === 'high' ? '高强度' : '正常'}` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleNlConfirm} className="rpg-btn-primary flex-1">
                    确认记录
                  </button>
                  <button onClick={() => { setNlResult(null); setNlReply('') }} className="rpg-btn">
                    重新解析
                  </button>
                </div>
              </div>
            )}

            {nlResult && nlResult.length === 0 && !nlError && !nlParsing && (
              <div className="rounded-lg border border-rpg-border bg-rpg-panel p-3 text-center text-xs text-gray-500">
                未解析到活动，请尝试更详细的描述，或返回手动记录。
              </div>
            )}
          </div>
        )}

        {type && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{DOMAIN_META[type].icon}</span>
              <span className="text-sm">{DOMAIN_META[type].label}</span>
              <button
                onClick={() => setType(null)}
                className="ml-auto text-xs text-gray-400 hover:text-white"
              >
                切换类型
              </button>
            </div>

            {type === 'exercise' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-300">运动类型</label>
                  <div className="grid grid-cols-4 gap-2">
                    {EXERCISE_SUBTYPES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSubtype(s.id)}
                        className={`rounded-lg border-2 p-2 text-[10px] transition-all ${
                          subtype === s.id
                            ? 'border-rpg-gold bg-rpg-panelLight'
                            : 'border-rpg-border bg-rpg-panel'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 运动发生时间：打完球补录时，记录运动真实发生的时刻 */}
                <div>
                  <label className="mb-1 block text-xs text-gray-300">发生时间</label>
                  <input
                    type="datetime-local"
                    value={exerciseAt}
                    max={toDatetimeLocal(new Date())}
                    onChange={(e) => setExerciseAt(e.target.value)}
                    className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none [color-scheme:dark]"
                  />
                  <div className="mt-1 text-[10px] leading-relaxed text-gray-500">
                    ⏱ 运动真实发生的时刻 · BOSS 时段限制按此判定 · 默认现在
                  </div>
                </div>
              </>
            )}

            {type === 'mental' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-300">今天的心情</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MOOD_OPTIONS.map((m) => (
                      <button
                        key={m.v}
                        onClick={() => setMood(m.v)}
                        className={`rounded-lg border-2 p-2 text-[10px] transition-all ${
                          mood === m.v
                            ? 'border-rpg-gold bg-rpg-panelLight'
                            : 'border-rpg-border bg-rpg-panel'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-300">今天发生了什么？</label>
                  <textarea
                    value={moodContent}
                    onChange={(e) => setMoodContent(e.target.value)}
                    rows={4}
                    placeholder="记录你的想法、情绪、触发因素……"
                    className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                  />
                </div>
              </>
            )}

            {needsTitle && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">标题</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="简要描述这次行动"
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
              </div>
            )}

            {needsDuration && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">
                  {type === 'sleep' ? '时长（小时）' : '时长（分钟）'}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={type === 'sleep' ? 0 : 5}
                    max={type === 'sleep' ? 12 : 300}
                    step={type === 'sleep' ? 0.5 : 5}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="flex-1 accent-rpg-xp"
                  />
                  <span className="w-16 text-right text-sm font-bold text-rpg-xp">
                    {type === 'sleep' ? `${duration}h` : `${duration}min`}
                  </span>
                </div>
              </div>
            )}

            {/* 睡眠时段：良好作息奖励系数（早睡 ×1.4 → 熬夜 ×0.3） */}
            {type === 'sleep' && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">睡眠时段</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {SLEEP_PERIODS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSleepPeriod(p.id)}
                      title={`${p.window} · XP ×${p.mult}`}
                      className={`rounded-lg border-2 px-1 py-1.5 text-[10px] transition-all ${
                        sleepPeriod === p.id
                          ? 'border-rpg-xp bg-rpg-xp/15 text-rpg-xp'
                          : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="font-bold">{p.label}</div>
                      <div className="text-[9px] text-gray-500">×{p.mult}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[9px] text-gray-500">
                  {SLEEP_PERIODS.find((p) => p.id === sleepPeriod)?.window} · 睡够 7-9 小时且时段越早，经验越高
                </div>
              </div>
            )}

            {/* 关联里程碑：本次行动时长计入其进度（可多选） */}
            {needsDuration && timeMilestones.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">关联里程碑（可多选）</label>
                <div className="flex flex-wrap gap-1.5">
                  {timeMilestones.map((m) => {
                    const selected = milestoneIds.includes(m.id)
                    const min = m.limits?.minPerSession
                    const tooShort = min !== undefined && duration < min
                    return (
                      <button
                        key={m.id}
                        onClick={() =>
                          setMilestoneIds((prev) =>
                            selected ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                          )
                        }
                        title={`${((m.linkedMinutes ?? 0) / 60).toFixed(1)}h / ${((m.metric?.target ?? 0) / 60).toFixed(0)}h${
                          min !== undefined ? `（单次≥${min}min 才计入）` : ''
                        }`}
                        className={`flex items-center gap-1 rounded-lg border-2 px-2 py-1 text-[10px] transition-all ${
                          selected
                            ? 'border-rpg-gold bg-rpg-gold/15 text-rpg-gold'
                            : tooShort
                              ? 'border-rpg-border bg-rpg-panel text-gray-600'
                              : 'border-rpg-border bg-rpg-panel text-gray-300 hover:border-rpg-gold/50'
                        }`}
                      >
                        <span>⏳</span>
                        <span className="max-w-36 truncate">{m.goal}</span>
                        <span className="opacity-60">{Math.round(m.progress * 100)}%</span>
                        {tooShort && <span title={`本次 ${duration}min 未达该目标单次下限 ${min}min`}>🚫</span>}
                      </button>
                    )
                  })}
                </div>
                <div className="mt-1 text-[10px] text-gray-500">
                  关联后，本次时长会分别累计到各里程碑的时间投入进度（受各目标单次限制约束）。
                </div>
              </div>
            )}

            {needsIntensity && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">强度</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { v: 'low', label: '轻松' },
                    { v: 'medium', label: '正常' },
                    { v: 'high', label: '高强度' },
                  ] as { v: Intensity; label: string }[]).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setIntensity(o.v)}
                      className={`rounded-lg border-2 p-2 text-xs transition-all ${
                        intensity === o.v
                          ? 'border-rpg-gold bg-rpg-panelLight'
                          : 'border-rpg-border bg-rpg-panel'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {type === 'exercise' && (
                  <div className="mt-1 text-[10px] leading-relaxed text-gray-500">
                    ⚔️ 与番茄钟同口径：局结算页 + XP/金币随成长产出 + 对 BOSS 造成伤害（强度作为倍率）。
                  </div>
                )}
                {type === 'challenge' && (
                  <div className="mt-1 text-[10px] leading-relaxed text-gray-500">
                    ⚔️ 挑战自我的记录同样走局结算：结算页 + XP/金币 + 对 BOSS 造成伤害。
                  </div>
                )}
              </div>
            )}

            {needsDifficulty && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">任务难度（1-5）</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`h-9 flex-1 rounded-lg border-2 text-sm transition-all ${
                        difficulty === d
                          ? 'border-rpg-courage bg-rpg-courage/30'
                          : 'border-rpg-border bg-rpg-panel'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {needsProactive && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={proactive}
                  onChange={(e) => setProactive(e.target.checked)}
                  className="h-4 w-4 accent-rpg-gold"
                />
                主动发起（而非被动接受）
              </label>
            )}

            {needsEscape && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={isEscape}
                  onChange={(e) => setIsEscape(e.target.checked)}
                  className="h-4 w-4 accent-rpg-courage"
                />
                因为不想面对问题而逃避（不会扣分，仅记录）
              </label>
            )}

            {type !== 'mental' && type !== 'sleep' && type !== 'exercise' && (
              <div>
                <label className="mb-1 block text-xs text-gray-300">备注（可选）</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="补充说明……"
                  className="w-full rounded-lg border-2 border-rpg-border bg-rpg-bg p-2 text-sm focus:border-rpg-gold focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={submit} className="rpg-btn-primary flex-1">
                记录
              </button>
              <button onClick={onClose} className="rpg-btn">
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
