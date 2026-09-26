import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { useRef, useEffect, useState, useCallback } from 'react';

export function ScrollReveal({ children, className = '', delay = 0, direction = 'up' }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const dir = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  };
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, ...dir[direction] }}
      animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerChildren({ children, className = '', stagger = 0.1 }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function FloatingOrb({ className = '', color = 'rgba(59,130,246,0.15)', size = 300, delay = 0 }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
      style={{ width: size, height: size, background: color, willChange: 'transform' }}
      animate={{
        y: [0, -30, 20, -10, 0],
        x: [0, 15, -10, 5, 0],
      }}
      transition={{ duration: 20, repeat: Infinity, delay, ease: 'easeInOut' }}
    />
  );
}

export function GradientMesh() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <FloatingOrb color="rgba(59,130,246,0.10)" size={400} className="top-[-10%] left-[-5%]" delay={0} />
      <FloatingOrb color="rgba(139,92,246,0.08)" size={350} className="top-[20%] right-[-8%]" delay={3} />
      <FloatingOrb color="rgba(16,185,129,0.06)" size={300} className="bottom-[10%] left-[15%]" delay={6} />
    </div>
  );
}

export function GridLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
      <div
        className="w-full h-full"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  );
}

export function GlowCard({ children, className = '', glowColor = 'rgba(59,130,246,0.15)' }) {
  return (
    <div className={`relative group ${className}`}>
      <div
        className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"
        style={{ background: glowColor }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function TiltCard({ children, className = '' }) {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const animate = useCallback(() => {
    const dx = targetRef.current.x - currentRef.current.x;
    const dy = targetRef.current.y - currentRef.current.y;
    currentRef.current.x += dx * 0.1;
    currentRef.current.y += dy * 0.1;
    if (ref.current) {
      ref.current.style.transform = `perspective(800px) rotateX(${currentRef.current.y}deg) rotateY(${currentRef.current.x}deg)`;
    }
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      rafRef.current = requestAnimationFrame(animate);
    } else {
      rafRef.current = null;
    }
  }, []);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = -((e.clientY - rect.top) / rect.height - 0.5) * 6;
    targetRef.current = { x, y };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  };

  const handleMouseLeave = () => {
    targetRef.current = { x: 0, y: 0 };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ willChange: 'transform', transition: 'transform 0.1s ease-out' }}
    >
      {children}
    </div>
  );
}

export function Typewriter({ text, className = '', speed = 40 }) {
  const [displayed, setDisplayed] = useState('');
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || started) return;
    setStarted(true);
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [isInView, started, text, speed]);

  return (
    <span ref={ref} className={className}>
      {displayed}
      {displayed.length < text.length && <span className="cursor-blink">|</span>}
    </span>
  );
}

export function CountUp({ target, duration = 2, className = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const increment = target / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return <span ref={ref} className={className}>{count}</span>;
}

export function MagneticButton({ children, className = '', strength = 0.3 }) {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });

  const animate = useCallback(() => {
    const dx = targetRef.current.x - currentRef.current.x;
    const dy = targetRef.current.y - currentRef.current.y;
    currentRef.current.x += dx * 0.15;
    currentRef.current.y += dy * 0.15;
    if (ref.current) {
      ref.current.style.transform = `translate(${currentRef.current.x}px, ${currentRef.current.y}px)`;
    }
    if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
      rafRef.current = requestAnimationFrame(animate);
    }
  }, []);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    targetRef.current.x = (e.clientX - rect.left - rect.width / 2) * strength;
    targetRef.current.y = (e.clientY - rect.top - rect.height / 2) * strength;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  };

  const handleMouseLeave = () => {
    targetRef.current = { x: 0, y: 0 };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ willChange: 'transform' }}
    >
      {children}
    </div>
  );
}

const particleStyles = `
@keyframes particle-drift {
  0%, 100% { transform: translateY(0) translateX(0); opacity: 0.15; }
  25% { transform: translateY(-60px) translateX(15px); opacity: 0.4; }
  50% { transform: translateY(-30px) translateX(-10px); opacity: 0.25; }
  75% { transform: translateY(-50px) translateX(8px); opacity: 0.35; }
}
`;

export function ParticleField({ count = 20 }) {
  const [particles] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      duration: Math.random() * 15 + 12,
      delay: Math.random() * 8,
    }))
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: particleStyles }} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-white/[0.08]"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              animation: `particle-drift ${p.duration}s ease-in-out ${p.delay}s infinite`,
              willChange: 'transform',
            }}
          />
        ))}
      </div>
    </>
  );
}

export function AnimatedCounter({ value, label, suffix = '' }) {
  return (
    <ScrollReveal>
      <div className="text-center">
        <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          <CountUp target={value} />{suffix}
        </div>
        <div className="text-white/60 mt-2 text-sm">{label}</div>
      </div>
    </ScrollReveal>
  );
}

export function MouseGlow({ color = 'rgba(99,102,241,0.07)', size = 600 }) {
  const elRef = useRef(null);
  const rafRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });
  const visibleRef = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const update = () => {
      el.style.background = `radial-gradient(${size}px circle at ${posRef.current.x}px ${posRef.current.y}px, ${color}, transparent 70%)`;
      rafRef.current = null;
    };

    const handleMove = (e) => {
      posRef.current.x = e.clientX;
      posRef.current.y = e.clientY;
      if (!visibleRef.current) {
        visibleRef.current = true;
        el.style.opacity = '1';
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(update);
    };

    const handleLeave = () => { visibleRef.current = false; el.style.opacity = '0'; };
    const handleEnter = () => { visibleRef.current = true; el.style.opacity = '1'; };

    window.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('mouseleave', handleLeave);
    document.addEventListener('mouseenter', handleEnter);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('mouseenter', handleEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [color, size]);

  return (
    <div
      ref={elRef}
      className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
      style={{ opacity: 0 }}
    />
  );
}

export function IDEBackground({ children }) {
  const containerRef = useRef(null);
  const spotlightRef = useRef(null);
  const glowRef = useRef(null);
  const rafRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const hoveringRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const { x, y } = mouseRef.current;
      if (spotlightRef.current) {
        spotlightRef.current.style.background = `radial-gradient(400px circle at ${x}px ${y}px, rgba(99,102,241,0.05), transparent 55%)`;
      }
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(250px circle at ${x}px ${y}px, rgba(139,92,246,0.06), transparent 45%)`;
      }
      rafRef.current = null;
    };

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      if (!rafRef.current) rafRef.current = requestAnimationFrame(update);
    };

    const handleEnter = () => {
      hoveringRef.current = true;
      if (spotlightRef.current) spotlightRef.current.style.opacity = '1';
      if (glowRef.current) glowRef.current.style.opacity = '0.4';
    };

    const handleLeave = () => {
      hoveringRef.current = false;
      if (spotlightRef.current) spotlightRef.current.style.opacity = '0';
      if (glowRef.current) glowRef.current.style.opacity = '0';
    };

    container.addEventListener('mousemove', handleMouseMove, { passive: true });
    container.addEventListener('mouseenter', handleEnter);
    container.addEventListener('mouseleave', handleLeave);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseenter', handleEnter);
      container.removeEventListener('mouseleave', handleLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Base grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Code overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.012] font-mono text-[11px] leading-5 text-white overflow-hidden select-none">
        <pre className="p-8">{`import React, { useState, useMemo } from 'react';
import { ChartContainer, MetricCard } from './components';
import { useFetchMetrics } from '../hooks';

export const Dashboard: React.FC<Props> = ({ projectId }) => {
  const [filter, setFilter] = useState('all');
  const metrics = useFetchMetrics(projectId);
  const data = useMemo(() => metrics.filter(m => m.status === filter), [metrics, filter]);
  return (<ChartContainer data={data} />);
};

async function GET(req: NextRequest) {
  const data = await fetchMetrics();
  return NextResponse.json(data);
}`}</pre>
      </div>

      {/* Mouse spotlight */}
      <div
        ref={spotlightRef}
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{ opacity: 0 }}
      />
      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{ opacity: 0 }}
      />

      <div className="relative z-10">{children}</div>
    </div>
  );
}
