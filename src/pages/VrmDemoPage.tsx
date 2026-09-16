/**
 * VRM 二次元角色 · 效果预览页（临时 demo，验证画风与装备锚定可行性）
 *
 * 技术栈：@pixiv/three-vrm（pixiv 官方，MIT）+ 现有 @react-three/fiber 架构
 * 模型：VRM Consortium / pixiv 官方示例模型（Seed-san、VRM1 Constraint Sample）
 *
 * 预览要点：
 * 1. MToon 二次元卡通渲染 + 头发/裙摆 SpringBone 物理摇摆
 * 2. 自动眨眼 + 呼吸 + 视线跟随鼠标（lookAt）
 * 3. 装备锚定演示：光环（头）/ 魔杖（手）/ 翅膀（背）—— 几何体挂 humanoid 标准骨骼
 */

import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three-stdlib'
import * as THREE from 'three'
import { VRM, VRMLoaderPlugin } from '@pixiv/three-vrm'

const MODELS = [
  { id: 'seed', label: '🌱 Seed-san', url: '/models/Seed-san.vrm' },
  { id: 'twist', label: '🏃 Twist Sample', url: '/models/VRM1_Constraint_Twist_Sample.vrm' },
] as const

type Pose = 'idle' | 'wave' | 'cheer'

const glowMat = (hex: string, emissive = 0.55) => (
  <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={emissive} roughness={0.3} metalness={0.3} />
)

/** VRM 舞台：加载模型 + 动画驱动 + 装备锚定 */
const VrmStage: React.FC<{
  url: string
  pose: Pose
  spin: boolean
  halo: boolean
  wand: boolean
  wings: boolean
}> = ({ url, pose, spin, halo, wand, wings }) => {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    // three-stdlib 与 three 官方 GLTFParser 类型存在私有成员差异（KTX2Loader 内部字段），
    // 运行时完全兼容（three-stdlib 即 three examples 的移植镜像），此处做类型桥接
    loader.register((parser) => new VRMLoaderPlugin(parser as never) as never)
  })
  const vrm = (gltf as unknown as { userData: { vrm: VRM } }).userData.vrm

  const t = useRef(0)
  const blinkTimer = useRef(2 + Math.random() * 2)
  const lookTarget = useRef<THREE.Object3D>(new THREE.Object3D())
  const haloRef = useRef<THREE.Group>(null)
  const wandRef = useRef<THREE.Group>(null)
  const wingsRef = useRef<THREE.Group>(null)

  // 视线跟随目标（挂在场景中的隐形物体）
  useEffect(() => {
    if (vrm.lookAt) vrm.lookAt.target = lookTarget.current
    return () => {
      if (vrm.lookAt) vrm.lookAt.target = null
    }
  }, [vrm])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    t.current += dt
    vrm.update(dt)

    // 转圈展示
    vrm.scene.rotation.y = spin ? t.current * 0.9 : 0

    // ===== 眨眼（随机间隔） =====
    blinkTimer.current -= dt
    let blink = 0
    if (blinkTimer.current <= 0) {
      const phase = -blinkTimer.current
      if (phase < 0.16) blink = Math.sin((phase / 0.16) * Math.PI)
      else blinkTimer.current = 1.5 + Math.random() * 3.5
    }
    vrm.expressionManager?.setValue('blink', blink)
    // 欢呼时开心表情（VRM1 标准预设）
    vrm.expressionManager?.setValue('happy', pose === 'cheer' ? 0.75 : 0)

    // ===== 呼吸 + 姿态（normalized humanoid，rest 为 T-pose） =====
    const humanoid = vrm.humanoid
    const chest = humanoid?.getNormalizedBoneNode('chest') ?? humanoid?.getNormalizedBoneNode('spine')
    if (chest) chest.rotation.x = Math.sin(t.current * 1.5) * 0.02

    const rArm = humanoid?.getNormalizedBoneNode('rightUpperArm')
    const lArm = humanoid?.getNormalizedBoneNode('leftUpperArm')
    if (rArm)
      rArm.rotation.z =
        pose === 'wave'
          ? -1.85 + Math.sin(t.current * 8) * 0.35
          : pose === 'cheer'
            ? -2.5 + Math.sin(t.current * 6) * 0.15
            : 0
    if (lArm) lArm.rotation.z = pose === 'cheer' ? 2.5 - Math.sin(t.current * 6) * 0.15 : 0

    // ===== 视线跟随鼠标 =====
    if (pose === 'cheer') lookTarget.current.position.set(0, 1.6, 1.1)
    else lookTarget.current.position.set(state.pointer.x * 1.5, 1.25 + state.pointer.y * 0.7, 1.1)

    // ===== 装备锚定（骨骼世界坐标同步，与现有 Equipped3D 同思路） =====
    const head = humanoid?.getNormalizedBoneNode('head')
    if (haloRef.current && head) {
      head.getWorldPosition(haloRef.current.position)
      haloRef.current.position.y += 0.24
      haloRef.current.rotation.y = t.current * 1.4
    }
    const hand = humanoid?.getNormalizedBoneNode('rightHand')
    if (wandRef.current && hand) {
      hand.getWorldPosition(wandRef.current.position)
      wandRef.current.rotation.y = t.current * 2
    }
    if (wingsRef.current && chest) {
      chest.getWorldPosition(wingsRef.current.position)
      wingsRef.current.position.z -= 0.1
      wingsRef.current.position.y -= 0.05
      wingsRef.current.rotation.x = Math.sin(t.current * 2.4) * 0.12
    }
  })

  return (
    <>
      <primitive object={vrm.scene} />
      <primitive object={lookTarget.current} />

      {/* ===== 装备：光环（头顶） ===== */}
      {halo && (
        <group ref={haloRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.17, 0.015, 8, 32]} />
            {glowMat('#fde047', 0.9)}
          </mesh>
        </group>
      )}

      {/* ===== 装备：魔杖（右手） ===== */}
      {wand && (
        <group ref={wandRef}>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.014, 0.02, 0.5, 8]} />
            <meshStandardMaterial color="#7c3aed" roughness={0.5} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.46, 0]}>
            <octahedronGeometry args={[0.05]} />
            {glowMat('#c084fc', 1)}
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <torusGeometry args={[0.035, 0.008, 6, 16]} />
            {glowMat('#fbbf24', 0.7)}
          </mesh>
        </group>
      )}

      {/* ===== 装备：翅膀（背后） ===== */}
      {wings && (
        <group ref={wingsRef}>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[side * 0.2, 0.02, -0.04]}
              rotation={[0.1, (side * Math.PI) / 2 - side * 0.5, side * 0.35]}
            >
              <planeGeometry args={[0.42, 0.55]} />
              <meshStandardMaterial
                color="#e0e7ff"
                emissive="#a5b4fc"
                emissiveIntensity={0.35}
                side={THREE.DoubleSide}
                transparent
                opacity={0.88}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* 地面接触阴影 + 底座光环 */}
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.42, 32]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.35} />
      </mesh>
    </>
  )
}

/** 控制按钮 */
const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-lg border-2 px-3 py-1 text-[11px] transition-all ${
      active ? 'border-rpg-gold bg-rpg-gold/20 text-rpg-gold' : 'border-rpg-border bg-rpg-panel text-gray-400 hover:text-white'
    }`}
  >
    {children}
  </button>
)

export const VrmDemoPage: React.FC = () => {
  const [modelId, setModelId] = useState<string>(MODELS[0].id)
  const [pose, setPose] = useState<Pose>('idle')
  const [spin, setSpin] = useState(false)
  const [halo, setHalo] = useState(true)
  const [wand, setWand] = useState(false)
  const [wings, setWings] = useState(false)

  const model = MODELS.find((m) => m.id === modelId) ?? MODELS[0]

  return (
    <div className="rpg-panel p-5">
      {/* 标题 */}
      <div className="mb-4">
        <h1 className="pixel-text text-sm text-rpg-gold">🧪 VRM 二次元形象 · 效果预览</h1>
        <p className="mt-1 text-[11px] text-gray-400">
          pixiv 官方 three-vrm 渲染 · MToon 卡通着色 + 头发裙摆物理摇摆 · 视线跟随鼠标 · 装备几何体锚定标准骨骼
        </p>
      </div>

      {/* 画布 */}
      <div className="flex h-[480px] items-center justify-center overflow-hidden rounded-xl border-2 border-rpg-border bg-gradient-to-b from-rpg-panelLight/50 to-transparent">
        <Suspense fallback={<span className="pixel-text animate-pulse text-[11px] text-rpg-gold">加载模型中...</span>}>
          <Canvas
            camera={{ position: [0, 1.15, 2.6], fov: 32 }}
            onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}
            gl={{ alpha: true, antialias: true }}
            dpr={[1, 2]}
            style={{ background: 'transparent' }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[1.5, 3, 2]} intensity={1.1} />
            <directionalLight position={[-2, 1.5, -1]} intensity={0.4} color="#a5b4fc" />
            <VrmStage key={model.id} url={model.url} pose={pose} spin={spin} halo={halo} wand={wand} wings={wings} />
          </Canvas>
        </Suspense>
      </div>

      {/* 控制面板 */}
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">模型</span>
          {MODELS.map((m) => (
            <Chip key={m.id} active={modelId === m.id} onClick={() => setModelId(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">动作</span>
          <Chip active={pose === 'idle'} onClick={() => setPose('idle')}>
            待机
          </Chip>
          <Chip active={pose === 'wave'} onClick={() => setPose('wave')}>
            挥手
          </Chip>
          <Chip active={pose === 'cheer'} onClick={() => setPose('cheer')}>
            欢呼
          </Chip>
          <Chip active={spin} onClick={() => setSpin((v) => !v)}>
            🔄 转圈展示
          </Chip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-[10px] text-gray-500">装备锚定</span>
          <Chip active={halo} onClick={() => setHalo((v) => !v)}>
            ☀️ 光环（头）
          </Chip>
          <Chip active={wand} onClick={() => setWand((v) => !v)}>
            ✨ 魔杖（手）
          </Chip>
          <Chip active={wings} onClick={() => setWings((v) => !v)}>
            🪽 翅膀（背）
          </Chip>
        </div>
      </div>

      {/* 使用提示 */}
      <div className="mt-4 rounded-xl border-2 border-rpg-border bg-rpg-panelLight/30 p-3 text-[11px] leading-relaxed text-gray-400">
        💡 移动鼠标，角色视线会跟随指针；「转圈展示」可看清全身与裙摆物理；切换装备开关可验证光环/魔杖/翅膀的骨骼锚定效果（挥手时魔杖会跟着手移动）。
      </div>

      {/* 决策卡 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-emerald-600/50 bg-emerald-500/10 p-3">
          <div className="text-[11px] font-bold text-emerald-300">✅ 满意 → 回复「采用 VRM」</div>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
            我将正式替换 Character 组件：保留装备槽位体系，几何体装备锚定 humanoid 骨骼；等级配件（腰带/翅膀/王冠/光环）同步迁移；模型可换成 VRoid 捏的你自己的角色。
          </p>
        </div>
        <div className="rounded-xl border-2 border-rpg-border bg-rpg-panelLight/30 p-3">
          <div className="text-[11px] font-bold text-gray-300">❌ 不满意 → 回复「回退 LPC」</div>
          <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
            恢复今天上午的 Universal-LPC 复古像素纸娃娃方案（换装图层最强，与 RPG UI 主题最搭），demo 页与依赖将一并清理。
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[10px] text-gray-600">
        模型：VRM Consortium「Seed-san」/ pixiv three-vrm 示例（仅供效果预览） · 依赖：@pixiv/three-vrm（MIT）
      </p>
    </div>
  )
}
