'use client';

import { useRef } from 'react';
import Link from "next/link";
import { motion, useInView } from 'framer-motion';
import { Button } from "@heroui/react";
import { 
  Shield, Zap, Brain, Network, Code, Lock, CheckCircle2, ArrowRight,
  Sparkles, Globe, Database, Cpu, GitBranch, FileCheck, AlertTriangle, TrendingUp
} from "lucide-react";

export default function Home() {
  const heroRef = useRef(null);
  const featuresRef = useRef(null);
  const howItWorksRef = useRef(null);
  
  const heroInView = useInView(heroRef, { once: true, margin: "-100px" });
  const featuresInView = useInView(featuresRef, { once: true, margin: "-100px" });
  const howItWorksInView = useInView(howItWorksRef, { once: true, margin: "-100px" });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-default-50 dark:from-default-900 dark:via-default-950 dark:to-default-900">
      {/* Animated Background Particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.1),transparent_50%)]"></div>
        <motion.div
          className="absolute top-20 left-20 w-72 h-72 bg-primary-500/20 rounded-full blur-3xl"
          animate={{
            x: [0, 100, 0],
            y: [0, 50, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl"
          animate={{
            x: [0, -100, 0],
            y: [0, -50, 0],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Navigation */}
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-bold">Compliance Copilot</span>
            </div>
            <div className="flex gap-3">
              <Link href="/login">
                <Button 
                  variant="light"
                  className="hover:bg-default-100 dark:hover:bg-default-800 transition-colors"
                >
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button 
                  color="primary"
                  className="shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">
          {/* Hero Section */}
          <motion.div
            ref={heroRef}
            initial={{ opacity: 0, y: 50 }}
            animate={heroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 via-primary-600 to-purple-600 p-8 md:p-12 shadow-2xl"
          >
            {/* Animated Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>
            
            {/* Floating Icons */}
            <motion.div
              className="absolute top-10 right-10 w-16 h-16 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center"
              animate={{ rotate: [0, 360], scale: [1, 1.1, 1] }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="w-8 h-8 text-white" />
            </motion.div>

            <div className="relative z-10 space-y-6">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={heroInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="flex items-center gap-3"
              >
                <motion.div
                  className="p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Shield className="w-8 h-8 text-white" />
                </motion.div>
                <div>
                  <h1 className="text-5xl md:text-6xl font-bold text-white mb-2">
                    Compliance Copilot
                  </h1>
                  <p className="text-primary-100 text-xl md:text-2xl">
                    AI-Powered Regulatory Compliance Automation
                  </p>
                  <p className="text-primary-200 text-base md:text-lg mt-2">
                    Professional auditor-style reports with evidence, findings, and remediation plans
                  </p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.4, duration: 0.6 }}
                className="max-w-3xl space-y-4"
              >
                <p className="text-white/90 text-lg md:text-xl leading-relaxed">
                        Automate regulatory readiness for <span className="font-semibold">SOC2</span>, <span className="font-semibold">GDPR</span>, <span className="font-semibold">HIPAA</span>, <span className="font-semibold">ISO 27001</span>, and <span className="font-semibold">PCI DSS</span> with intelligent AI agents that analyze your codebase, cloud infrastructure, and documentation.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  {['Multi-Agent AI System', 'Real-Time Analysis', 'Automated Remediation'].map((feature, idx) => (
                    <motion.div
                      key={feature}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={heroInView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ delay: 0.5 + idx * 0.1, duration: 0.4 }}
                      className="px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30 text-white text-sm font-medium"
                    >
                      <CheckCircle2 className="w-4 h-4 inline mr-2" />
                      {feature}
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={heroInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="pt-4"
              >
                <Link href="/signup">
                  <Button
                    size="lg"
                    className="bg-white text-primary-600 font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                  >
                    Get Started Free
                  </Button>
                </Link>
              </motion.div>
            </div>
          </motion.div>

          {/* How It Works Section */}
          <motion.section
            ref={howItWorksRef}
            initial={{ opacity: 0 }}
            animate={howItWorksInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="space-y-12 py-16"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-center space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 dark:bg-primary-900/20 rounded-full border border-primary-200 dark:border-primary-800">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">5-Phase Process</span>
              </div>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-primary-600 via-purple-600 to-primary-600 bg-clip-text text-transparent">
                How It Works
              </h2>
              <p className="text-default-600 dark:text-default-400 text-lg md:text-xl max-w-3xl mx-auto leading-relaxed">
                Our intelligent multi-agent system orchestrates a comprehensive compliance assessment through 5 strategic phases, ensuring thorough analysis and actionable insights
              </p>
            </motion.div>

            {/* Timeline Container */}
            <div className="relative">
              {/* Connecting Line - Desktop */}
              <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 via-yellow-500 via-green-500 to-indigo-500 transform -translate-y-1/2 z-0">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={howItWorksInView ? { scaleX: 1 } : {}}
                  transition={{ duration: 1.5, delay: 0.5 }}
                  className="h-full w-full bg-gradient-to-r from-blue-500 via-purple-500 via-yellow-500 via-green-500 to-indigo-500 origin-left"
                />
              </div>

              {/* Phase Cards */}
              <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 lg:gap-4">
                {[
                  { 
                    icon: Brain, 
                    title: 'Planning', 
                    desc: 'AI creates strategic assessment plan based on selected framework', 
                    color: 'from-blue-500 to-cyan-500',
                    bgColor: 'bg-blue-50 dark:bg-blue-900/10',
                    borderColor: 'border-blue-200 dark:border-blue-800',
                    details: 'Framework selection, scope definition, and agent orchestration'
                  },
                  { 
                    icon: Network, 
                    title: 'Extraction', 
                    desc: 'Intelligent agents scan codebase, infrastructure & docs via MCP', 
                    color: 'from-purple-500 to-pink-500',
                    bgColor: 'bg-purple-50 dark:bg-purple-900/10',
                    borderColor: 'border-purple-200 dark:border-purple-800',
                    details: 'Multi-source data collection from GitHub, AWS, and 15+ integrations'
                  },
                  { 
                    icon: Zap, 
                    title: 'Analysis', 
                    desc: 'Regulation RAG, gap analysis & research using AI tools', 
                    color: 'from-yellow-500 to-orange-500',
                    bgColor: 'bg-yellow-50 dark:bg-yellow-900/10',
                    borderColor: 'border-yellow-200 dark:border-yellow-800',
                    details: 'Vector search, requirement mapping, and compliance gap identification'
                  },
                  { 
                    icon: Code, 
                    title: 'Remediation', 
                    desc: 'Action planner generates prioritized remediation roadmap', 
                    color: 'from-green-500 to-emerald-500',
                    bgColor: 'bg-green-50 dark:bg-green-900/10',
                    borderColor: 'border-green-200 dark:border-green-800',
                    details: 'Prioritized tasks with step-by-step implementation guidance'
                  },
                  { 
                    icon: CheckCircle2, 
                    title: 'Report', 
                    desc: 'Comprehensive compliance report with evidence & recommendations', 
                    color: 'from-indigo-500 to-blue-500',
                    bgColor: 'bg-indigo-50 dark:bg-indigo-900/10',
                    borderColor: 'border-indigo-200 dark:border-indigo-800',
                    details: 'Executive summary, detailed findings, and compliance score'
                  },
                ].map((phase, idx) => (
                  <motion.div
                    key={phase.title}
                    initial={{ opacity: 0, y: 50, scale: 0.9 }}
                    animate={howItWorksInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                    transition={{ 
                      delay: 0.3 + idx * 0.15, 
                      duration: 0.6,
                      type: "spring",
                      stiffness: 100
                    }}
                    whileHover={{ 
                      y: -12, 
                      scale: 1.03,
                      transition: { duration: 0.2 }
                    }}
                    className="relative group"
                  >
                    {/* Phase Number Badge */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={howItWorksInView ? { scale: 1 } : {}}
                        transition={{ delay: 0.4 + idx * 0.15, type: "spring", stiffness: 200 }}
                        className={`w-10 h-10 rounded-full bg-gradient-to-br ${phase.color} flex items-center justify-center shadow-lg border-4 border-background dark:border-default-900`}
                      >
                        <span className="text-white font-bold text-sm">{idx + 1}</span>
                      </motion.div>
                    </div>

                    {/* Arrow Connector - Mobile/Tablet */}
                    {idx < 4 && (
                      <div className="lg:hidden absolute -bottom-6 left-1/2 -translate-x-1/2 z-10">
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
                          transition={{ delay: 0.5 + idx * 0.15 }}
                        >
                          <ArrowRight className="w-6 h-6 text-default-400 rotate-90" />
                        </motion.div>
                      </div>
                    )}

                    {/* Main Card */}
                    <div className={`h-full ${phase.bgColor} backdrop-blur-sm rounded-2xl border-2 ${phase.borderColor} shadow-lg hover:shadow-2xl transition-all duration-300 p-6 space-y-4 relative overflow-hidden group-hover:border-opacity-100`}>
                      {/* Animated Background Gradient */}
                      <motion.div
                        className={`absolute inset-0 bg-gradient-to-br ${phase.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
                        initial={false}
                      />

                      {/* Icon Container */}
                      <motion.div
                        className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br ${phase.color} p-5 flex items-center justify-center shadow-xl group-hover:shadow-2xl transition-all duration-300`}
                        whileHover={{ 
                          rotate: [0, -5, 5, -5, 0],
                          scale: 1.1
                        }}
                        transition={{ duration: 0.5 }}
                      >
                        <phase.icon className="w-10 h-10 text-white" />
                        {/* Glow effect */}
                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${phase.color} opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-300`} />
                      </motion.div>

                      {/* Content */}
                      <div className="space-y-3 relative z-10">
                        <div className="space-y-1">
                          <h3 className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors">
                            {phase.title}
                          </h3>
                          <p className="text-sm text-default-600 dark:text-default-400 leading-relaxed">
                            {phase.desc}
                          </p>
                        </div>
                        
                        {/* Details on Hover */}
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          whileHover={{ opacity: 1, height: 'auto' }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 border-t border-default-200 dark:border-default-800">
                            <p className="text-xs text-default-500 dark:text-default-400 italic">
                              {phase.details}
                            </p>
                          </div>
                        </motion.div>

                        {/* Phase Badge */}
                        <div className="flex items-center gap-2 pt-2">
                          <span className="text-xs font-semibold text-primary bg-primary/10 dark:bg-primary/20 px-3 py-1 rounded-full border border-primary/20">
                            Phase {idx + 1}
                          </span>
                        </div>
                      </div>

                      {/* Decorative Elements */}
                      <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <phase.icon className="w-16 h-16 text-current" />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Bottom CTA */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 1, duration: 0.6 }}
                className="text-center mt-12 pt-8 border-t border-default-200 dark:border-default-800"
              >
                <p className="text-default-600 dark:text-default-400 mb-4">
                  Ready to see it in action?
                </p>
                <Link href="/signup">
                  <Button 
                    size="lg" 
                    color="primary"
                    className="shadow-lg hover:shadow-xl transition-all hover:scale-105"
                    endContent={<ArrowRight className="w-4 h-4" />}
                  >
                    Start Your Assessment
                  </Button>
                </Link>
              </motion.div>
            </div>
          </motion.section>

          {/* Features Section */}
          <motion.section
            ref={featuresRef}
            initial={{ opacity: 0 }}
            animate={featuresInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="space-y-12"
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={featuresInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-center space-y-4"
            >
              <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-600 via-purple-600 to-primary-600 bg-clip-text text-transparent">
                Enterprise-Grade Compliance Automation
              </h2>
              <p className="text-xl text-default-600 dark:text-default-400 max-w-3xl mx-auto">
                Powered by AI agents that understand your infrastructure, codebase, and compliance requirements
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={featuresInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-center space-y-3"
            >
              <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
                Powerful Features
              </h2>
              <p className="text-default-600 dark:text-default-400 text-lg max-w-2xl mx-auto">
                Everything you need for comprehensive compliance automation
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Globe, title: 'MCP Integration', desc: 'Connect GitHub, AWS, Jira, and 15+ tools via Model Context Protocol', gradient: 'from-blue-500 to-cyan-500' },
                { icon: Brain, title: 'AI Agents', desc: 'Specialized cybersecurity agents that think like penetration testers', gradient: 'from-purple-500 to-pink-500' },
                { icon: Database, title: 'RAG Pipeline', desc: 'Vector search with Corrective RAG for regulation retrieval', gradient: 'from-green-500 to-emerald-500' },
                { icon: Lock, title: 'Multi-Framework', desc: 'SOC2, GDPR, HIPAA, ISO 27001, PCI DSS support with framework-specific analysis', gradient: 'from-red-500 to-orange-500' },
                { icon: Cpu, title: 'Real-Time Analysis', desc: 'Live agent activity monitoring with detailed logs', gradient: 'from-yellow-500 to-amber-500' },
                { icon: GitBranch, title: 'Evidence Tracking', desc: 'Code snippets, configs, and logs linked to findings', gradient: 'from-indigo-500 to-blue-500' },
              ].map((feature, idx) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={featuresInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.3 + idx * 0.1, duration: 0.5 }}
                  whileHover={{ y: -5, scale: 1.02 }}
                  className="group"
                >
                  <div className="h-full bg-content1/80 backdrop-blur-sm rounded-2xl border border-default-200 dark:border-default-100 shadow-lg hover:shadow-2xl transition-all overflow-hidden">
                    <div className={`h-1 bg-gradient-to-r ${feature.gradient}`}></div>
                    <div className="p-6 space-y-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} p-3 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
                        <feature.icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold">{feature.title}</h3>
                        <p className="text-sm text-default-600 dark:text-default-400 leading-relaxed">
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-center py-16"
          >
            <div className="max-w-2xl mx-auto space-y-6 p-8 rounded-3xl bg-gradient-to-br from-primary-500/10 via-purple-500/10 to-primary-500/10 border border-primary-200/50 dark:border-primary-800/50 backdrop-blur-sm">
              <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
                Ready to automate your compliance?
              </h2>
              <p className="text-default-600 dark:text-default-400 text-lg">
                Start your free assessment today and see how Compliance Copilot can help you achieve regulatory readiness.
              </p>
              <Link href="/signup">
                <Button 
                  size="lg" 
                  color="primary" 
                  className="text-lg px-8 shadow-lg hover:shadow-xl transition-all hover:scale-105"
                >
                  Get Started Free
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
