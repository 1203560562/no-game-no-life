/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', 'monospace'],
        rpg: ['Zpix', '"DotGothic16"', '"Press Start 2P"', 'monospace'],
      },
      colors: {
        rpg: {
          bg: '#1a1033',
          panel: '#2a1a4a',
          panelLight: '#3d2a63',
          border: '#5b3f8f',
          gold: '#ffd54a',
          xp: '#5eead4',
          vitality: '#ff6b6b',
          wisdom: '#5b8def',
          focus: '#fbbf24',
          creativity: '#c084fc',
          courage: '#fb7185',
          connection: '#34d399',
          freedom: '#60a5fa',
        },
      },
      boxShadow: {
        glow: '0 0 20px rgba(94, 234, 212, 0.5)',
        gold: '0 0 15px rgba(255, 213, 74, 0.6)',
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'float-slow': 'float 5s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 1.5s ease-in-out infinite',
        'pop-in': 'popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'shake': 'shake 0.5s',
        'coin-fly': 'coinFly 1s ease-out forwards',
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'float-up': 'floatUp 1.7s ease-out forwards',
        'record-banner': 'recordBanner 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'flash': 'flash 0.9s ease-out forwards',
        // BOSS 伤害战报（普通伤害「重击感」）
        'slash-streak': 'slashStreak 0.75s cubic-bezier(0.22, 0.9, 0.3, 1) forwards',
        'impact-shake': 'impactShake 0.55s ease-out',
        'damage-slam': 'damageSlam 0.7s cubic-bezier(0.34, 1.3, 0.64, 1) forwards',
        // BOSS 击杀仪式（hit-stop → 显现 → 碎裂 → 胜利定格）
        'white-flash': 'whiteFlash 0.5s ease-out forwards',
        // 胜利舞台旋转光芒（升级/结算全屏仪式背景）
        'rays-spin': 'raysSpin 24s linear infinite',
        'boss-emerge': 'bossEmerge 0.65s cubic-bezier(0.22, 0.9, 0.3, 1) both',
        'shockwave': 'shockwave 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'kill-slam': 'killSlam 0.7s cubic-bezier(0.34, 1.3, 0.64, 1) forwards',
        'kill-quake': 'killQuake 0.9s ease-out',
        'hp-crack': 'hpCrack 0.4s ease-out forwards',
        // BOSS 立绘 idle：主题色光晕呼吸（颜色经 --boss-glow 变量注入）
        'boss-aura': 'bossAura 2.6s ease-in-out infinite',
        'boss-breathe': 'bossBreathe 3.4s ease-in-out infinite',
        // ===== 角色分部位动画（LPC 纸娃娃蓝本） =====
        'char-breathe': 'charBreathe 3.2s ease-in-out infinite',
        'char-bob': 'charBob 0.62s ease-in-out infinite',
        'char-arm-idle-l': 'charArmIdleL 3.2s ease-in-out infinite',
        'char-arm-idle-r': 'charArmIdleR 3.2s ease-in-out infinite',
        'char-arm-walk-l': 'charArmWalkL 0.62s ease-in-out infinite',
        'char-arm-walk-r': 'charArmWalkR 0.62s ease-in-out infinite',
        'char-leg-walk-l': 'charLegWalkL 0.62s ease-in-out infinite',
        'char-leg-walk-r': 'charLegWalkR 0.62s ease-in-out infinite',
        'char-attack-swing': 'charAttackSwing 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'char-attack-lunge': 'charAttackLunge 0.55s ease-out',
        'char-cast-raise': 'charCastRaise 0.8s ease-in-out infinite',
        'char-cast-float': 'charCastFloat 1.4s ease-in-out infinite',
        'char-cheer-jump': 'charCheerJump 0.7s cubic-bezier(0.3, 0, 0.4, 1) infinite',
        'char-cheer-arm': 'charCheerArm 0.7s ease-in-out infinite',
        'wing-flap': 'wingFlap 2.4s ease-in-out infinite',
        'cape-wave': 'capeWave 2.8s ease-in-out infinite',
        'pet-bounce': 'petBounce 1.6s ease-in-out infinite',
        'pet-tail': 'petTail 1.2s ease-in-out infinite',
        'crystal-glow': 'crystalGlow 2s ease-in-out infinite',
        'flame-jet': 'flameJet 0.5s ease-in-out infinite',
        // ===== 宝箱开箱动画 =====
        'chest-idle': 'chestIdle 2s ease-in-out infinite',
        'chest-shake': 'chestShake 0.14s linear infinite',
        'chest-quake': 'chestQuake 0.5s ease-out 2',
        'beam-rise': 'beamRise 0.5s ease-out both',
        'card-flip': 'cardFlip 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both',
        'holo-shine': 'holoShine 2.2s ease-in-out infinite',
        'chest-flash': 'chestFlash 0.8s ease-out forwards',
        // ===== 背景装饰粒子动画 =====
        'bg-fall': 'bgFall 9s linear infinite',
        'bg-rise': 'bgRise 7s linear infinite',
        'bg-twinkle': 'bgTwinkle 2.6s ease-in-out infinite',
        'bg-drift': 'bgDrift 5s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(255, 213, 74, 0.4)' },
          '50%': { boxShadow: '0 0 30px rgba(255, 213, 74, 0.8)' },
        },
        popIn: {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '75%': { transform: 'translateX(5px)' },
        },
        coinFly: {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(-60px) scale(0.5)', opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        floatUp: {
          '0%': { transform: 'translateY(0) scale(0.7)', opacity: '0' },
          '12%': { transform: 'translateY(-12px) scale(1.15)', opacity: '1' },
          '70%': { opacity: '1' },
          '100%': { transform: 'translateY(-100px) scale(0.95)', opacity: '0' },
        },
        recordBanner: {
          '0%': { transform: 'scale(0.3) rotate(-6deg)', opacity: '0' },
          '60%': { transform: 'scale(1.15) rotate(2deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        flash: {
          '0%': { opacity: '0' },
          '30%': { opacity: '0.65' },
          '100%': { opacity: '0' },
        },
        // ===== BOSS 伤害战报（普通伤害「重击感」） =====
        // 斩击刀光：一道斜切光带划过后收尾
        slashStreak: {
          '0%': { transform: 'translateX(-130%) rotate(-24deg) scaleX(0.4)', opacity: '0' },
          '18%': { opacity: '1' },
          '55%': { transform: 'translateX(130%) rotate(-24deg) scaleX(1)', opacity: '0.9' },
          '100%': { transform: 'translateX(160%) rotate(-24deg) scaleX(1)', opacity: '0' },
        },
        // 屏幕震动：受击整体晃动（叠加在内容层）
        impactShake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-9px, 5px)' },
          '20%': { transform: 'translate(8px, -6px)' },
          '35%': { transform: 'translate(-6px, 4px)' },
          '50%': { transform: 'translate(5px, -3px)' },
          '70%': { transform: 'translate(-3px, 2px)' },
        },
        // 伤害数字重击弹出：超大 → 回弹定格，带切斜错位
        damageSlam: {
          '0%': { transform: 'scale(3.2) skewX(-8deg)', opacity: '0' },
          '35%': { transform: 'scale(1.25) skewX(-8deg)', opacity: '1' },
          '55%': { transform: 'scale(0.95) skewX(-8deg)' },
          '100%': { transform: 'scale(1) skewX(-6deg)', opacity: '1' },
        },
        // ===== BOSS 击杀仪式 =====
        // 命中定格瞬间的白闪（hit-stop 感官锚点）
        whiteFlash: {
          '0%': { opacity: '0' },
          '20%': { opacity: '0.95' },
          '100%': { opacity: '0' },
        },
        // 胜利舞台光芒旋转（径向扇形光带绕屏心缓慢转动）
        raysSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // BOSS 立绘从黑暗中显现（模糊 + 缩放收敛）
        bossEmerge: {
          '0%': { opacity: '0', filter: 'blur(10px)', transform: 'scale(1.22)' },
          '100%': { opacity: '1', filter: 'blur(0px)', transform: 'scale(1)' },
        },
        // 冲击波环：从中心炸开消散
        shockwave: {
          '0%': { transform: 'scale(0.15)', opacity: '0.9' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        // BOSS SLAIN 标志性大字：超大模糊 → 回弹定格
        killSlam: {
          '0%': { transform: 'scale(3.4) skewX(-8deg)', opacity: '0', filter: 'blur(6px)' },
          '40%': { transform: 'scale(1.15) skewX(-4deg)', opacity: '1', filter: 'blur(0px)' },
          '60%': { transform: 'scale(0.96) skewX(-2deg)' },
          '100%': { transform: 'scale(1) skewX(0deg)', opacity: '1' },
        },
        // 击杀大震动（幅度大于普通受击 impactShake）
        killQuake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '8%': { transform: 'translate(-13px, 8px)' },
          '18%': { transform: 'translate(12px, -9px)' },
          '30%': { transform: 'translate(-9px, 6px)' },
          '45%': { transform: 'translate(7px, -5px)' },
          '60%': { transform: 'translate(-5px, 3px)' },
          '80%': { transform: 'translate(3px, -2px)' },
        },
        // 血条击碎归零时的红色过曝
        hpCrack: {
          '0%': { filter: 'brightness(1)' },
          '30%': { filter: 'brightness(3.2) saturate(2)' },
          '100%': { filter: 'brightness(1)', opacity: '0' },
        },
        // BOSS 立绘 idle 光晕呼吸（颜色由元素 --boss-glow 提供，避开启用写死）
        bossAura: {
          '0%, 100%': { filter: 'drop-shadow(0 0 12px var(--boss-glow))' },
          '50%': { filter: 'drop-shadow(0 0 36px var(--boss-glow))' },
        },
        // BOSS 立绘 idle 呼吸（轻微缩放，叠加在浮动层内侧）
        bossBreathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.012)' },
        },
        // ===== 角色分部位动画 =====
        charBreathe: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(1.5px)' },
        },
        charBob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-2.5px)' },
        },
        charArmIdleL: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
        charArmIdleR: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '50%': { transform: 'rotate(-3deg)' },
        },
        charArmWalkL: {
          '0%, 100%': { transform: 'rotate(18deg)' },
          '50%': { transform: 'rotate(-18deg)' },
        },
        charArmWalkR: {
          '0%, 100%': { transform: 'rotate(-18deg)' },
          '50%': { transform: 'rotate(18deg)' },
        },
        charLegWalkL: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        charLegWalkR: {
          '0%, 100%': { transform: 'translateY(-3px)' },
          '50%': { transform: 'translateY(0)' },
        },
        charAttackSwing: {
          '0%': { transform: 'rotate(-75deg)' },
          '55%': { transform: 'rotate(35deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        charAttackLunge: {
          '0%': { transform: 'translateX(0)' },
          '40%': { transform: 'translateX(7px) rotate(6deg)' },
          '100%': { transform: 'translateX(0) rotate(0deg)' },
        },
        charCastRaise: {
          '0%, 100%': { transform: 'rotate(-125deg)' },
          '50%': { transform: 'rotate(-140deg)' },
        },
        charCastFloat: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        charCheerJump: {
          '0%, 100%': { transform: 'translateY(0)' },
          '45%': { transform: 'translateY(-14px)' },
          '60%': { transform: 'translateY(-12px)' },
        },
        charCheerArm: {
          '0%, 100%': { transform: 'rotate(-150deg)' },
          '50%': { transform: 'rotate(-168deg)' },
        },
        wingFlap: {
          '0%, 100%': { transform: 'scaleX(1)' },
          '50%': { transform: 'scaleX(0.82)' },
        },
        capeWave: {
          '0%, 100%': { transform: 'skewX(0deg)' },
          '50%': { transform: 'skewX(4deg)' },
        },
        petBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        petTail: {
          '0%, 100%': { transform: 'rotate(-8deg)' },
          '50%': { transform: 'rotate(10deg)' },
        },
        crystalGlow: {
          '0%, 100%': { opacity: '0.75' },
          '50%': { opacity: '1' },
        },
        flameJet: {
          '0%, 100%': { transform: 'scaleY(1)', opacity: '1' },
          '50%': { transform: 'scaleY(1.5)', opacity: '0.7' },
        },
        // ===== 宝箱开箱动画 =====
        chestIdle: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-8px) rotate(-2deg)' },
        },
        chestShake: {
          '0%, 100%': { transform: 'translateX(0) rotate(0deg) scale(1)' },
          '25%': { transform: 'translateX(-6px) rotate(-5deg) scale(1.04)' },
          '75%': { transform: 'translateX(6px) rotate(5deg) scale(1.04)' },
        },
        chestQuake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '20%': { transform: 'translate(-8px, 4px)' },
          '40%': { transform: 'translate(8px, -4px)' },
          '60%': { transform: 'translate(-6px, -3px)' },
          '80%': { transform: 'translate(6px, 3px)' },
        },
        beamRise: {
          '0%': { transform: 'translateX(-50%) scaleY(0)', opacity: '0', transformOrigin: 'bottom' },
          '35%': { opacity: '1' },
          '100%': { transform: 'translateX(-50%) scaleY(1)', opacity: '1', transformOrigin: 'bottom' },
        },
        cardFlip: {
          '0%': { transform: 'perspective(700px) rotateY(92deg) scale(0.6)', opacity: '0' },
          '60%': { transform: 'perspective(700px) rotateY(-12deg) scale(1.06)', opacity: '1' },
          '100%': { transform: 'perspective(700px) rotateY(0deg) scale(1)', opacity: '1' },
        },
        holoShine: {
          '0%, 100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(1.35) saturate(1.2)' },
        },
        chestFlash: {
          '0%': { opacity: '0' },
          '25%': { opacity: '0.55' },
          '100%': { opacity: '0' },
        },
        // ===== 背景装饰粒子（绝对定位粒子，top 百分比相对容器高度） =====
        bgFall: {
          '0%': { top: '-10%', opacity: '0', transform: 'translateX(0) rotate(0deg)' },
          '12%': { opacity: '1' },
          '50%': { transform: 'translateX(9px) rotate(24deg)' },
          '88%': { opacity: '1' },
          '100%': { top: '110%', opacity: '0', transform: 'translateX(-7px) rotate(-16deg)' },
        },
        bgRise: {
          '0%': { top: '110%', opacity: '0', transform: 'translateX(0) scale(0.7)' },
          '14%': { opacity: '1' },
          '50%': { transform: 'translateX(7px) scale(1)' },
          '86%': { opacity: '1' },
          '100%': { top: '-10%', opacity: '0', transform: 'translateX(-5px) scale(0.85)' },
        },
        bgTwinkle: {
          '0%, 100%': { opacity: '0.15', transform: 'scale(0.7)' },
          '50%': { opacity: '1', transform: 'scale(1.2)' },
        },
        bgDrift: {
          '0%, 100%': { opacity: '0.35', transform: 'translate(0, 0) scale(0.9)' },
          '50%': { opacity: '0.9', transform: 'translate(7px, -9px) scale(1.1)' },
        },
      },
    },
  },
  plugins: [],
}
