import Head from 'next/head';
import ModernHeader from '../components/ModernHeader';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';

export default function Onboarding() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [roles, setRoles] = useState([]);
  const [goal, setGoal] = useState('');
  const [experience, setExperience] = useState('');
  const [loading, setLoading] = useState(false);

  const toggleRole = (role) => setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const complete = async () => {
    setLoading(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('authToken')}` },
        body: JSON.stringify({ fullName, company, teamSize, roles, goal, experience }),
      });
      router.push('/dashboard');
    } catch (e) {
      console.error(e);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Welcome to BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="min-h-screen bg-[#0a1628] text-white overflow-x-hidden">
        <div className="cube cube-1" />
        <div className="cube cube-2" />
        <div className="cube cube-3" />

        <div className="content w-full max-w-2xl mx-auto px-4 py-12">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-300">Step {step} of 5</span>
              <span className="text-sm text-gray-400">{step}/5</span>
            </div>
            <div className="w-full bg-[#1a2332] rounded-full h-2">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500" style={{ width: `${step * 20}%` }} />
            </div>
          </div>

          {step === 1 && (
            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12">
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <img src="/1000222021 1 (1).png" alt="Logo" className="w-12 h-12" />
                </div>
                <h1 className="text-4xl font-bold text-white mb-3">Welcome to BuildrsHQ</h1>
                <p className="text-gray-300 text-lg">Let's personalize your experience in just a few steps</p>
              </div>

              <div className="space-y-5 mb-10">
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">What's your name?</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-4 py-4 bg-[#0a1628] border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition" placeholder="John Doe" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Company Name (Optional)</label>
                  <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-4 py-4 bg-[#0a1628] border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition" placeholder="Acme Inc" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-2">Team Size</label>
                  <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="w-full px-4 py-4 bg-[#0a1628] border border-gray-600 rounded-xl text-white focus:outline-none focus:border-blue-500 transition">
                    <option value="">Select team size</option>
                    <option value="Just me">Just me</option>
                    <option value="2-10">2-10 people</option>
                    <option value="11-50">11-50 people</option>
                    <option value="51-200">51-200 people</option>
                    <option value="200+">200+ people</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={nextStep} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition font-semibold">Continue →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-3">What's your role?</h2>
                <p className="text-gray-300">Select all that apply</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
                {['CEO', 'Designer', 'Developer', 'Product Manager', 'Marketing', 'Executive'].map((role) => (
                  <button key={role} type="button" onClick={() => toggleRole(role)} className={`role-btn p-6 border-2 rounded-xl hover:border-blue-500 transition text-center ${roles.includes(role) ? 'border-blue-500 bg-[#0a1628]' : 'border-gray-600 bg-[#0a1628]'}`}>
                    <div className="text-4xl mb-3">{role === 'Developer' ? '💻' : role === 'Designer' ? '🎨' : role === 'CEO' ? '👔' : role === 'Product Manager' ? '📋' : role === 'Marketing' ? '📈' : '🏢'}</div>
                    <div className="font-semibold text-white">{role}</div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={prevStep} className="px-8 py-4 border border-gray-600 text-gray-300 rounded-xl hover:bg-[#0a1628] transition font-semibold">← Back</button>
                <button type="button" onClick={nextStep} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition font-semibold">Continue →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-3">What brings you to BuildrsHQ?</h2>
                <p className="text-gray-300">Choose your primary goal</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {['Build faster', 'Collaborate better', 'Learn AI coding'].map((g) => (
                  <button key={g} type="button" onClick={() => setGoal(g)} className={`p-6 border-2 rounded-xl hover:border-blue-500 transition text-center ${goal === g ? 'border-blue-500 bg-[#0a1628]' : 'border-gray-600 bg-[#0a1628]'}`}>
                    <div className="text-4xl mb-3">{g === 'Build faster' ? '🚀' : g === 'Collaborate better' ? '🤝' : '🧠'}</div>
                    <div className="font-semibold text-white">{g}</div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={prevStep} className="px-8 py-4 border border-gray-600 text-gray-300 rounded-xl hover:bg-[#0a1628] transition font-semibold">← Back</button>
                <button type="button" onClick={nextStep} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition font-semibold">Continue →</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12">
              <div className="text-center mb-10">
                <h2 className="text-3xl font-bold text-white mb-3">How would you describe your coding experience?</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {['Beginner', 'Intermediate', 'Expert'].map((level) => (
                  <button key={level} type="button" onClick={() => setExperience(level)} className={`p-6 border-2 rounded-xl hover:border-blue-500 transition text-center ${experience === level ? 'border-blue-500 bg-[#0a1628]' : 'border-gray-600 bg-[#0a1628]'}`}>
                    <div className="text-4xl mb-3">{level === 'Beginner' ? '🌱' : level === 'Intermediate' ? '🌿' : '🌳'}</div>
                    <div className="font-semibold text-white">{level}</div>
                  </button>
                ))}
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={prevStep} className="px-8 py-4 border border-gray-600 text-gray-300 rounded-xl hover:bg-[#0a1628] transition font-semibold">← Back</button>
                <button type="button" onClick={nextStep} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition font-semibold">Continue →</button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="bg-[#1a2332] rounded-2xl border border-gray-700 p-8 md:p-12 text-center">
              <h2 className="text-3xl font-bold text-white mb-4">You're all set!</h2>
              <p className="text-gray-300 mb-8">Your personalized BuildrsHQ experience is ready.</p>
              <button type="button" onClick={complete} disabled={loading} className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition font-semibold">
                {loading ? 'Saving...' : 'Go to Dashboard'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
