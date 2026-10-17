import React, { useState } from 'react';
import { projectApi } from '../lib/api';
import {
  Check, Github, FileText, Code, Layout, Settings, Bot, X, Loader2,
  Folder, Figma
} from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Product details', subtitle: 'Name and access' },
  { id: 2, title: 'Source', subtitle: 'Code and repository' },
  { id: 3, title: 'Context', subtitle: 'Stack and intelligence' },
  { id: 4, title: 'Review', subtitle: 'Confirm configuration' },
];

export default function CreateProjectWizard({ onClose, onCreated }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [showConfigurationReady, setShowConfigurationReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdProject, setCreatedProject] = useState(null);
  const [project, setProject] = useState({
    name: '',
    description: '',
    visibility: 'private',
    sourceType: 'github',
    repositoryUrl: '',
    branch: 'main',
    template: 'Full-stack web application',
    technologies: ['TypeScript', 'React', 'Next.js', 'PostgreSQL', 'Tailwind CSS'],
    customTechnology: '',
    customTechnologies: [],
    intelligence: {
      figma: false,
      starterSpec: true,
      aiAgents: true,
    },
  });
  const [showCustomTechnologyInput, setShowCustomTechnologyInput] = useState(false);

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));
  const handleFinishReview = async () => {
    setSubmitError('');
    if (!project.name.trim()) {
      setSubmitError('Enter a project name before creating the project.');
      return;
    }
    if (project.sourceType === 'github' && !project.repositoryUrl.trim()) {
      setSubmitError('Enter a GitHub repository URL or choose another source.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await projectApi.create({
        name: project.name.trim(),
        description: project.description.trim(),
        visibility: project.visibility,
        sourceType: project.sourceType,
        githubRepoUrl: project.sourceType === 'github' ? project.repositoryUrl.trim() : undefined,
        defaultBranch: project.branch.trim() || 'main',
        template: project.sourceType === 'template' ? project.template : '',
        technologies: [...project.technologies, ...project.customTechnologies],
        intelligence: project.intelligence,
      });
      if (!response?.success || !response.project) {
        throw new Error(response?.message || 'The server did not confirm project creation.');
      }
      setCreatedProject(response.project);
      setShowConfigurationReady(true);
    } catch (error) {
      setSubmitError(error.message || 'Could not create the project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  const updateProject = (field, value) => {
    setProject((current) => ({ ...current, [field]: value }));
  };
  const toggleTechnology = (technology) => {
    setProject((current) => ({
      ...current,
      technologies: current.technologies.includes(technology)
        ? current.technologies.filter((item) => item !== technology)
        : [...current.technologies, technology],
    }));
  };
  const addCustomTechnology = () => {
    const technology = project.customTechnology.trim();
    if (!technology || project.customTechnologies.includes(technology)) return;
    setProject((current) => ({
      ...current,
      customTechnologies: [...current.customTechnologies, technology],
      customTechnology: '',
    }));
  };
  const toggleIntelligence = (setting) => {
    setProject((current) => ({
      ...current,
      intelligence: {
        ...current.intelligence,
        [setting]: !current.intelligence[setting],
      },
    }));
  };
  const projectName = project.name.trim() || 'Untitled project';
  const sourceLabel = {
    scratch: 'Start from scratch',
    github: 'GitHub repository',
    template: 'Template',
  }[project.sourceType];
  const selectedTechnologies = [...project.technologies, ...project.customTechnologies];
  const accessLabel = project.visibility === 'private' ? 'Private' : 'Public';

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col p-6">
      {/* Header */}
      <div className="mb-8">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
          WORK / PROJECT
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-white">Add new project</h1>
        <p className="mt-1 text-xs text-zinc-500">
          Set up the shared context your team and AI agents will build from.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8 flex gap-3 overflow-x-auto pb-2">
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;

          return (
            <div
              key={step.id}
              className={`flex flex-1 min-w-[200px] items-center gap-3 rounded-xl border p-3 transition-colors ${isActive ? 'border-cyan-500/50 bg-cyan-500/5' :
                  isCompleted ? 'border-white/10 bg-[#0d1119]' :
                    'border-white/[0.07] bg-[#0d1119] opacity-60'
                }`}
            >
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCompleted ? 'bg-cyan-500 text-slate-950' :
                  isActive ? 'bg-cyan-400 text-slate-950' :
                    'bg-zinc-800 text-zinc-400'
                }`}>
                {isCompleted ? <Check className="h-3 w-3" strokeWidth={3} /> : step.id}
              </div>
              <div className="flex flex-col">
                <span className={`text-xs font-semibold ${isActive || isCompleted ? 'text-white' : 'text-zinc-400'}`}>
                  {step.title}
                </span>
                <span className="text-[10px] text-zinc-500">{step.subtitle}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 rounded-2xl border border-white/[0.07] bg-[#0d1119] p-6 relative overflow-hidden flex flex-col">

        {/* Step 1: Product Details */}
        {currentStep === 1 && (
          <div className="flex-1 flex flex-col">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Layout className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Product details</h2>
                <p className="text-xs text-zinc-500">Give the project a clear identity and decide who can discover it.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6">
                <div>
                  <label className="mb-1 block text-xs font-medium text-white">Project name *</label>
                  <input
                    type="text"
                    value={project.name}
                    onChange={(event) => updateProject('name', event.target.value)}
                    placeholder="e.g acme customer portal"
                    aria-label="Project name"
                    className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">This name appears across tasks, specs, agents, and connected tools.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-white">Description</label>
                  <textarea
                    rows="3"
                    value={project.description}
                    onChange={(event) => updateProject('description', event.target.value)}
                    placeholder="A unified customer workspace for onboarding, billing, support, and account administration."
                    aria-label="Project description"
                    className="w-full rounded-lg border border-white/10 bg-[#161b26] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none resize-none"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">Optional - Add the outcome or product surface this project owns.</p>
                </div>
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 flex gap-3">
                  <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-cyan-400 flex items-center justify-center text-[10px] text-cyan-400">i</div>
                  <p className="text-[10px] text-cyan-200/80">Use a product or initiative name your team already recognizes. You can rename it later.</p>
                </div>
              </div>

              {/* Right Column */}
              <div>
                <label className="mb-2 block text-xs font-medium text-white">Access</label>
                <p className="mb-4 text-[10px] text-zinc-500">Save a visibility preference for this project. Workspace sharing can be configured separately.</p>

                <div className="space-y-3">
                  {/* Private Option */}
                  <button
                    type="button"
                    aria-pressed={project.visibility === 'private'}
                    onClick={() => updateProject('visibility', 'private')}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${project.visibility === 'private' ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-white/10 bg-[#161b26] hover:border-white/20'}`}
                  >
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${project.visibility === 'private' ? 'border-cyan-400' : 'border-zinc-600'}`}>
                      {project.visibility === 'private' && <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white">Private</h3>
                      <p className="text-[10px] text-zinc-400">Mark this project as private</p>
                    </div>
                  </button>
                  {/* Public Option */}
                  <button
                    type="button"
                    aria-pressed={project.visibility === 'public'}
                    onClick={() => updateProject('visibility', 'public')}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${project.visibility === 'public' ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-white/10 bg-[#161b26] hover:border-white/20'}`}
                  >
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${project.visibility === 'public' ? 'border-cyan-400' : 'border-zinc-600'}`}>
                      {project.visibility === 'public' && <div className="h-2.5 w-2.5 rounded-full bg-cyan-400" />}
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white">Public</h3>
                      <p className="text-[10px] text-zinc-400">Mark this project as public</p>
                    </div>
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/5 bg-[#161b26] p-3">
                  <Check className="h-3 w-3 text-emerald-400" />
                  <p className="text-[10px] text-zinc-400">
                    {project.visibility === 'private'
                      ? 'Private visibility preference will be saved with this project.'
                      : 'Public visibility preference will be saved with this project.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Source */}
        {currentStep === 2 && (
          <div className="flex-1 flex flex-col">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Code className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Choose a source</h2>
                <p className="text-xs text-zinc-500">Define where the initial project context comes from. Connections can be changed later.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Option 1: Scratch */}
              <div className={`rounded-xl border p-4 flex flex-col ${project.sourceType === 'scratch' ? 'border-cyan-500 bg-cyan-500/5' : 'border-white/10 bg-[#161b26]'}`}>
                <button type="button" aria-pressed={project.sourceType === 'scratch'} onClick={() => updateProject('sourceType', 'scratch')} className="flex w-full items-center justify-between mb-4 text-left">
                  <div className="flex items-center gap-2">
                    <FileText className={`h-4 w-4 ${project.sourceType === 'scratch' ? 'text-cyan-400' : 'text-zinc-400'}`} />
                    <h3 className="text-sm font-medium text-white">Start from scratch</h3>
                  </div>
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${project.sourceType === 'scratch' ? 'border-cyan-400' : 'border-zinc-600'}`}>
                    {project.sourceType === 'scratch' && <div className="h-2 w-2 rounded-full bg-cyan-400" />}
                  </div>
                </button>
                <p className="text-[10px] text-zinc-500 mb-4">Create an empty project context and connect code later.</p>
                <div className="mt-auto space-y-2">
                  <label className="text-[10px] text-zinc-400">Default branch</label>
                  <input type="text" value={project.branch} onChange={(event) => updateProject('branch', event.target.value)} aria-label="Default branch" className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-1.5 text-xs text-white" />
                  <p className="text-[10px] text-zinc-600 flex items-center gap-1"><Bot className="h-3 w-3" /> A clean workspace with no indexed source.</p>
                </div>
              </div>

              {/* Option 2: GitHub (Active) */}
              <div className={`rounded-xl border p-4 flex flex-col ${project.sourceType === 'github' ? 'border-2 border-cyan-500 bg-cyan-500/5' : 'border-white/10 bg-[#161b26]'}`}>
                <button type="button" aria-pressed={project.sourceType === 'github'} onClick={() => updateProject('sourceType', 'github')} className="flex w-full items-center justify-between mb-4 text-left">
                  <div className="flex items-center gap-2">
                    <Github className={`h-4 w-4 ${project.sourceType === 'github' ? 'text-cyan-400' : 'text-zinc-400'}`} />
                    <h3 className="text-sm font-medium text-white">Connect GitHub</h3>
                  </div>
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${project.sourceType === 'github' ? 'border-cyan-400' : 'border-zinc-600'}`}>
                    {project.sourceType === 'github' && <div className="h-2 w-2 rounded-full bg-cyan-400" />}
                  </div>
                </button>
                <p className="text-[10px] text-zinc-400 mb-4">Save a GitHub repository URL and default branch. Repository indexing is not enabled yet.</p>
                <div className="mt-auto space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-400">GitHub repository URL *</label>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b0f17] px-2 py-1.5 mt-1">
                      <Github className="h-3 w-3 text-zinc-500" />
                      <input type="url" value={project.repositoryUrl} onChange={(event) => updateProject('repositoryUrl', event.target.value)} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" className="bg-transparent text-xs text-white placeholder-zinc-600 focus:outline-none w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Default branch</label>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#0b0f17] px-2 py-1.5 mt-1">
                      <Code className="h-3 w-3 text-zinc-500" />
                      <input type="text" value={project.branch} onChange={(event) => updateProject('branch', event.target.value)} aria-label="GitHub default branch" className="bg-transparent text-xs text-white focus:outline-none w-full" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#161b26] px-3 py-1.5">
                    <Github className="h-3 w-3 text-zinc-400" />
                    <p className="text-[10px] text-zinc-400">Repository details are saved locally for now.</p>
                  </div>
                </div>
              </div>

              {/* Option 3: Template */}
              <div className={`rounded-xl border p-4 flex flex-col ${project.sourceType === 'template' ? 'border-cyan-500 bg-cyan-500/5' : 'border-white/10 bg-[#161b26]'}`}>
                <button type="button" aria-pressed={project.sourceType === 'template'} onClick={() => updateProject('sourceType', 'template')} className="flex w-full items-center justify-between mb-4 text-left">
                  <div className="flex items-center gap-2">
                    <Layout className={`h-4 w-4 ${project.sourceType === 'template' ? 'text-cyan-400' : 'text-zinc-400'}`} />
                    <h3 className="text-sm font-medium text-white">Use a template</h3>
                  </div>
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${project.sourceType === 'template' ? 'border-cyan-400' : 'border-zinc-600'}`}>
                    {project.sourceType === 'template' && <div className="h-2 w-2 rounded-full bg-cyan-400" />}
                  </div>
                </button>
                <p className="text-[10px] text-zinc-500 mb-4">Begin with a proven workspace configuration and stack.</p>
                <div className="mt-auto space-y-3">
                  <div>
                    <label className="text-[10px] text-zinc-400">Template</label>
                    <select value={project.template} onChange={(event) => updateProject('template', event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-2 py-1.5 text-xs text-white mt-1 focus:outline-none focus:border-cyan-500">
                      <option>Full-stack web application</option>
                      <option>TypeScript API Service</option>
                      <option>React Native application</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Default branch</label>
                    <input type="text" value={project.branch} onChange={(event) => updateProject('branch', event.target.value)} aria-label="Template default branch" className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-3 py-1.5 text-xs text-white mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Context */}
        {currentStep === 3 && (
          <div className="flex-1 flex flex-col">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Stack and intelligence</h2>
                <p className="text-xs text-zinc-500">Help teammates and agents reason with the right technologies, design context, and project instructions.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Left: Tech Stack */}
              <div>
                <h3 className="text-sm font-medium text-white mb-1">Technology stack</h3>
                <p className="text-[10px] text-zinc-500 mb-4">Select all that apply. Agents use this to tailor generated tasks, specs, and code suggestions.</p>

                <div className="flex flex-wrap gap-2">
                  {['TypeScript', 'React', 'Next.js', 'Python', 'PostgreSQL', 'Tailwind CSS'].map((tech) => {
                    const isSelected = project.technologies.includes(tech);
                    return (
                      <button
                        type="button"
                        key={tech}
                        aria-pressed={isSelected}
                        onClick={() => toggleTechnology(tech)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${isSelected
                            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                            : 'border-white/10 bg-[#161b26] text-zinc-400 hover:border-white/20'
                          }`}
                      >
                        {tech === 'TypeScript' && <Code className="h-3 w-3" />}
                        {tech === 'React' && <Layout className="h-3 w-3" />}
                        {tech === 'Next.js' && <Layout className="h-3 w-3" />}
                        {tech === 'Python' && <Code className="h-3 w-3" />}
                        {tech === 'PostgreSQL' && <Folder className="h-3 w-3" />}
                        {tech === 'Tailwind CSS' && <Layout className="h-3 w-3" />}
                        {tech}
                        {isSelected && <Check className="h-3 w-3 ml-1" />}
                      </button>
                    );
                  })}
                  {project.customTechnologies.map((technology) => (
                    <button
                      key={technology}
                      type="button"
                      aria-pressed="true"
                      onClick={() => setProject((current) => ({
                        ...current,
                        customTechnologies: current.customTechnologies.filter((item) => item !== technology),
                      }))}
                      className="flex items-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300"
                    >
                      {technology}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomTechnologyInput((shown) => !shown)}
                    aria-expanded={showCustomTechnologyInput}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161b26] px-3 py-1.5 text-xs text-zinc-400 hover:border-white/20"
                  >
                    + Other
                  </button>
                </div>

                {showCustomTechnologyInput && (
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      addCustomTechnology();
                    }}
                  >
                    <input
                      type="text"
                      value={project.customTechnology}
                      onChange={(event) => updateProject('customTechnology', event.target.value)}
                      aria-label="Other technology"
                      placeholder="Technology name"
                      className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#161b26] px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-cyan-500 focus:outline-none"
                    />
                    <button type="submit" className="rounded-lg border border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/10">
                      Add
                    </button>
                  </form>
                )}

                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/5 bg-[#161b26] p-3">
                  <Check className="h-3 w-3 text-cyan-400" />
                  <p className="text-[10px] text-zinc-400">{selectedTechnologies.length} {selectedTechnologies.length === 1 ? 'technology' : 'technologies'} selected. <span className="text-zinc-500">Stack tags stay editable in project settings.</span></p>
                </div>
              </div>

              {/* Right: Intelligence Settings */}
              <div>
                <h3 className="text-sm font-medium text-white mb-1">Intelligence settings</h3>
                <p className="text-[10px] text-zinc-500 mb-4">Choose which context systems are prepared when the project is created.</p>

                <div className="space-y-3">
                  {/* Setting 1 */}
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161b26] p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                        <Figma className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-white">Connect Figma context</h4>
                        <p className="text-[10px] text-zinc-500">Link design files and keep implementation decisions in context</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={project.intelligence.figma}
                      aria-label="Connect Figma context"
                      onClick={() => toggleIntelligence('figma')}
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${project.intelligence.figma ? 'justify-end bg-cyan-500' : 'justify-start bg-zinc-700'}`}
                    >
                      <span className={`h-4 w-4 rounded-full shadow ${project.intelligence.figma ? 'bg-white' : 'bg-zinc-400'}`} />
                    </button>
                  </div>

                  {/* Setting 2 */}
                  <div className={`flex items-center justify-between rounded-xl border p-3 ${project.intelligence.starterSpec ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-[#161b26]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${project.intelligence.starterSpec ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-white">Generate starter specification</h4>
                        <p className="text-[10px] text-zinc-400">Create an editable spec.md from your project configuration</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={project.intelligence.starterSpec}
                      aria-label="Generate starter specification"
                      onClick={() => toggleIntelligence('starterSpec')}
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${project.intelligence.starterSpec ? 'justify-end bg-cyan-500' : 'justify-start bg-zinc-700'}`}
                    >
                      <span className={`h-4 w-4 rounded-full shadow ${project.intelligence.starterSpec ? 'bg-white' : 'bg-zinc-400'}`} />
                    </button>
                  </div>

                  {/* Setting 3 */}
                  <div className={`flex items-center justify-between rounded-xl border p-3 ${project.intelligence.aiAgents ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-[#161b26]'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${project.intelligence.aiAgents ? 'bg-cyan-500/20 text-cyan-400' : 'bg-zinc-800 text-zinc-400'}`}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-white">Prepare AI agent environment</h4>
                        <p className="text-[10px] text-zinc-400">Enable agents to receive scoped tasks as soon as setup is complete</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={project.intelligence.aiAgents}
                      aria-label="Prepare AI agent environment"
                      onClick={() => toggleIntelligence('aiAgents')}
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${project.intelligence.aiAgents ? 'justify-end bg-cyan-500' : 'justify-start bg-zinc-700'}`}
                    >
                      <span className={`h-4 w-4 rounded-full shadow ${project.intelligence.aiAgents ? 'bg-white' : 'bg-zinc-400'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="flex-1 flex flex-col">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">Review configuration</h2>
              <p className="text-xs text-zinc-500">Review your choices before saving the project.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Product Details Summary */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-white">Product details</h3>
                  <button type="button" onClick={() => setCurrentStep(1)} className="text-[10px] text-cyan-400 hover:underline">Edit</button>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Name</span><span className="break-words text-white">{projectName}</span></div>
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Description</span><span className="break-words text-white">{project.description || 'No description provided'}</span></div>
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Access</span><span className="text-cyan-400">{accessLabel}</span></div>
                </div>
              </div>

              {/* Source Summary */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-white">Source</h3>
                  <button type="button" onClick={() => setCurrentStep(2)} className="text-[10px] text-cyan-400 hover:underline">Edit</button>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Connection</span><span className="text-cyan-400">{sourceLabel}</span></div>
                  {project.sourceType === 'github' && <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Repository</span><span className="break-all text-white">{project.repositoryUrl || 'Not provided'}</span></div>}
                  {project.sourceType === 'template' && <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Template</span><span className="text-white">{project.template}</span></div>}
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Branch</span><span className="text-white">{project.branch || 'main'}</span></div>
                </div>
              </div>

              {/* Stack Summary */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-white">Stack</h3>
                  <button type="button" onClick={() => setCurrentStep(3)} className="text-[10px] text-cyan-400 hover:underline">Edit</button>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Selected</span><span className="text-white">{project.technologies.join(' · ') || 'None'}</span></div>
                  <div className="flex"><span className="w-24 shrink-0 text-zinc-500">Custom</span><span className="text-white">{project.customTechnologies.join(' · ') || 'None'}</span></div>
                </div>
              </div>

              {/* Intelligence Summary */}
              <div className="rounded-xl border border-white/10 bg-[#161b26] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-white">Intelligence</h3>
                  <button type="button" onClick={() => setCurrentStep(3)} className="text-[10px] text-cyan-400 hover:underline">Edit</button>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex"><span className="w-24 text-zinc-500">Figma</span><span className={project.intelligence.figma ? 'text-cyan-400' : 'text-zinc-400'}>{project.intelligence.figma ? 'Enabled' : 'Disabled'}</span></div>
                  <div className="flex"><span className="w-24 text-zinc-500">Starter spec</span><span className={project.intelligence.starterSpec ? 'text-cyan-400' : 'text-zinc-400'}>{project.intelligence.starterSpec ? 'Enabled' : 'Disabled'}</span></div>
                  <div className="flex"><span className="w-24 text-zinc-500">AI agents</span><span className={project.intelligence.aiAgents ? 'text-cyan-400' : 'text-zinc-400'}>{project.intelligence.aiAgents ? 'Enabled' : 'Disabled'}</span></div>
                </div>
              </div>
            </div>

            {/* What happens next */}
            <div className="rounded-xl border border-white/5 bg-[#0b0f17] p-4 mt-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-white">Configuration status</h3>
                <span className="text-[10px] text-zinc-500">Saved when you create the project</span>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-400">
                Project details, source settings, technology selections, and intelligence preferences will be sent to BuildrsHQ.
              </p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 flex items-center justify-end gap-3 pt-4 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={prevStep}
              disabled={isSaving}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
            >
              Back
            </button>
          )}
          {currentStep < 4 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={isSaving}
              className="rounded-lg bg-cyan-400 px-6 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleFinishReview}
              type="button"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-6 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
              {isSaving ? 'Creating project...' : 'Create project'}
            </button>
          )}
        </div>
        {submitError && (
          <p role="alert" className="mt-3 text-right text-xs text-rose-400">{submitError}</p>
        )}
      </div>

      {/* Configuration confirmation */}
      {showConfigurationReady && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1119] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-white">Project created</h2>
              </div>
              <button
                type="button"
                onClick={() => createdProject ? onCreated?.(createdProject) : setShowConfigurationReady(false)}
                aria-label={createdProject ? 'Open dashboard' : 'Close confirmation'}
                className="text-zinc-500 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-6 rounded-xl border border-white/5 bg-[#161b26] p-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Project configuration</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between gap-4"><span className="text-zinc-400">Name</span><span className="text-right font-medium text-white">{createdProject?.name || projectName}</span></div>
                <div className="flex justify-between gap-4"><span className="shrink-0 text-zinc-400">Stack</span><span className="text-right text-white">{selectedTechnologies.join(' · ') || 'None selected'}</span></div>
                {project.sourceType === 'github' && <div className="flex justify-between gap-4"><span className="text-zinc-400">Repository</span><span className="break-all text-right text-white">{project.repositoryUrl || 'Not provided'}</span></div>}
                <div className="flex justify-between gap-4"><span className="text-zinc-400">Access</span><span className="text-right text-cyan-400">{accessLabel}</span></div>
              </div>
            </div>
            <p className="mb-6 text-xs text-zinc-400">
              Your project and selected configuration have been saved. GitHub indexing, workspace sharing, and template generation are not enabled yet.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => onCreated?.(createdProject)}
                className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300"
              >
                Open dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}