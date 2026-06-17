import React, { useEffect, useState, useRef } from 'react';
import { auth, database } from '../firebase';
import { ref, onValue, set } from 'firebase/database';
import { signOut, User } from 'firebase/auth';
import { Thermometer, Droplets, Power, LogOut, Mic, MicOff, Sun, Moon, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Speech interface definitions
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SystemLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'success';
}

export default function Dashboard({ user }: { user: User }) {
  const [temperature, setTemperature] = useState<number>(0);
  const [humidity, setHumidity] = useState<number>(0);
  const [relays, setRelays] = useState({
    Relay1: false,
    Relay2: false,
    Relay3: false,
    Relay4: false
  });
  const [listening, setListening] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const recognitionRef = useRef<any>(null);
  const sequenceActive = useRef<boolean>(false);
  const sequenceSpeedRef = useRef<number>(500);
  const [sequenceSpeed, setSequenceSpeed] = useState<number>(500);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;
    return document.documentElement.classList.contains('dark');
  });
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<{time: string, temp: number, hum: number}[]>([]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const nextMode = !isDarkMode;
    setIsDarkMode(nextMode);
    if (nextMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const addLog = (message: string, type: SystemLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setLogs(prev => {
      const newLogs = [...prev, { id: Math.random().toString(), timestamp, message, type }];
      if (newLogs.length > 200) return newLogs.slice(newLogs.length - 200);
      return newLogs;
    });
  };

  useEffect(() => {
    if (logsEndRef.current && activeTab === 'logs') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  useEffect(() => {
    const time = new Date().toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory(prev => {
      const newHistory = [...prev, { time, temp: temperature, hum: humidity }];
      if (newHistory.length > 20) return newHistory.slice(newHistory.length - 20);
      return newHistory;
    });
  }, [temperature, humidity]);

  useEffect(() => {
    addLog('System Check: Initializing Connection...', 'info');

    // DB Refs
    const tempRef = ref(database, 'IoT/Suhu');
    const humRef = ref(database, 'IoT/Kelembapan');
    
    // Relay Refs
    const r1Ref = ref(database, 'IoT/Relay1');
    const r2Ref = ref(database, 'IoT/Relay2');
    const r3Ref = ref(database, 'IoT/Relay3');
    const r4Ref = ref(database, 'IoT/Relay4');

    const unsubs = [
      onValue(tempRef, (snapshot) => {
        if (snapshot.exists()) setTemperature(snapshot.val());
      }),
      onValue(humRef, (snapshot) => {
        if (snapshot.exists()) setHumidity(snapshot.val());
      }),
      onValue(r1Ref, (snapshot) => {
        if (snapshot.exists()) setRelays(prev => ({ ...prev, Relay1: snapshot.val() }));
      }),
      onValue(r2Ref, (snapshot) => {
        if (snapshot.exists()) setRelays(prev => ({ ...prev, Relay2: snapshot.val() }));
      }),
      onValue(r3Ref, (snapshot) => {
        if (snapshot.exists()) setRelays(prev => ({ ...prev, Relay3: snapshot.val() }));
      }),
      onValue(r4Ref, (snapshot) => {
        if (snapshot.exists()) setRelays(prev => ({ ...prev, Relay4: snapshot.val() }));
      })
    ];

    // Setup Voice Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'id-ID'; // Indonesian
      
      recognitionRef.current.onstart = () => setListening(true);
      recognitionRef.current.onend = () => setListening(false);
      recognitionRef.current.onerror = (e: any) => {
        console.error("Speech recognition error", e);
        setListening(false);
      }
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        addLog(`Voice Input Detected: "${transcript}"`, 'info');
        processVoiceCommand(transcript);
      };
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  // Update voice handler refs on re-render to avoid stale state in callbacks
  const latestState = useRef({ temperature, humidity, relays });
  useEffect(() => {
    latestState.current = { temperature, humidity, relays };
  }, [temperature, humidity, relays]);

  const toggleRelay = (relayKey: string) => {
    const currentState = relays[relayKey as keyof typeof relays];
    set(ref(database, `IoT/${relayKey}`), !currentState);
    addLog(`Manual Overide: Toggled ${relayKey} to ${!currentState ? 'ON' : 'OFF'}`, 'success');
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseInt(e.target.value, 10);
    setSequenceSpeed(newSpeed);
    sequenceSpeedRef.current = newSpeed;
  };

  const executeSequence = async (sequence: number[]) => {
    sequenceActive.current = false; // Batalkan urutan yang mungkin sedang berjalan
    await new Promise((resolve) => setTimeout(resolve, 100)); 
    sequenceActive.current = true;
    addLog(`Sequence Initiated: [${sequence.join(', ')}]`, 'info');

    while (sequenceActive.current) {
      // Matikan semua relay di awal siklus
      if (!sequenceActive.current) break;
      set(ref(database, 'IoT/Relay1'), false);
      set(ref(database, 'IoT/Relay2'), false);
      set(ref(database, 'IoT/Relay3'), false);
      set(ref(database, 'IoT/Relay4'), false);
      
      await new Promise((resolve) => setTimeout(resolve, sequenceSpeedRef.current));

      for (const num of sequence) {
         if (!sequenceActive.current) break;
         set(ref(database, `IoT/Relay${num}`), true);
         await new Promise((resolve) => setTimeout(resolve, sequenceSpeedRef.current));
      }
      
      if (!sequenceActive.current) break;
      await new Promise((resolve) => setTimeout(resolve, sequenceSpeedRef.current)); // Jeda sesaat sebelum mengulang
    }
  };

  const turnOnSequence1 = () => executeSequence([1, 2, 3, 4]);
  const turnOnSequence2 = () => executeSequence([4, 3, 2, 1]);
  
  const stopSequenceAndTurnOff = () => {
    sequenceActive.current = false;
    set(ref(database, 'IoT/Relay1'), false);
    set(ref(database, 'IoT/Relay2'), false);
    set(ref(database, 'IoT/Relay3'), false);
    set(ref(database, 'IoT/Relay4'), false);
    addLog('System Halt: All sequences stopped & Relays OFF', 'warn');
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const speak = (text: string) => {
    try {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis failed:', e);
    }
  };

  const processVoiceCommand = (command: string) => {
    const state = latestState.current;
    
    // Temperature & Humidity
    if (command.includes('suhu') || command.includes('temperatur')) {
        speak(`Suhu saat ini adalah ${state.temperature.toFixed(1)} derajat Celcius.`);
    } else if (command.includes('kelembapan') || command.includes('lembab')) {
        speak(`Kelembapan saat ini adalah ${state.humidity.toFixed(1)} persen.`);
    } 
    
    // Commands for Relays (Nyalakan / Hidupkan / Matikan)
    const toggleRegex = /(hidupkan|nyalakan|matikan|aktifkan|nonaktifkan)\s+relay\s+([1-4])/i;
    const match = command.match(toggleRegex);

    if (match) {
        const action = match[1].toLowerCase();
        const relayNum = match[2];
        const relayKey = `Relay${relayNum}`;
        const isOn = ['hidupkan', 'nyalakan', 'aktifkan'].includes(action);

        set(ref(database, `IoT/${relayKey}`), isOn);
        speak(`Relay ${relayNum} telah di${isOn ? 'nyalakan' : 'matikan'}.`);
    } else if (command.includes('hidupkan semua relay') || command.includes('nyalakan semua relay')) {
        set(ref(database, 'IoT/Relay1'), true);
        set(ref(database, 'IoT/Relay2'), true);
        set(ref(database, 'IoT/Relay3'), true);
        set(ref(database, 'IoT/Relay4'), true);
        speak("Semua relay telah dinyalakan.");
    } else if (command.includes('matikan semua relay')) {
        stopSequenceAndTurnOff();
        speak("Semua relay telah dimatikan.");
    } else if (command.includes('variasi')) {
        if (command.includes('matikan') || command.includes('berhenti') || command.includes('stop')) {
           stopSequenceAndTurnOff();
           speak("Mematikan variasi dan semua relay.");
        } else if (command.includes('satu') || command.includes('1')) {
           turnOnSequence1();
           speak("Menyalakan relay dengan variasi satu.");
        } else if (command.includes('dua') || command.includes('2')) {
           turnOnSequence2();
           speak("Menyalakan relay dengan variasi dua.");
        }
    }
  };

  const toggleListen = () => {
    if (listening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-col p-6 shadow-xl hidden md:flex shrink-0">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl">I</div>
          <div>
            <h1 className="font-bold text-lg leading-none">ESP32 IoT</h1>
            <p className="text-xs text-slate-400 mt-1">Node: IOTT-NODE-01</p>
          </div>
        </div>
        <nav className="flex-1 space-y-2">
          <div 
            onClick={() => setActiveTab('dashboard')}
            className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'dashboard' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg> Dashboard
          </div>
          <div 
            onClick={() => setActiveTab('logs')}
            className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'logs' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> Logs
          </div>
          <div 
            onClick={() => setActiveTab('settings')}
            className={`p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors ${activeTab === 'settings' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg> Settings
          </div>
        </nav>
        <div className="pt-6 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden shrink-0">
               {user.photoURL && <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />}
            </div>
            <div className="text-xs overflow-hidden">
              <p className="font-semibold truncate">{user.displayName || 'Admin User'}</p>
              <p className="text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full py-2 bg-slate-800 text-xs rounded hover:bg-slate-700 transition-colors">Logout</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 sm:p-8 overflow-y-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
              {activeTab === 'dashboard' ? 'System Overview' : activeTab === 'logs' ? 'System Logs' : 'Settings'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Firebase RTDB Connected (iott-esp32-default-rtdb)</p>
          </div>
          <div className="flex gap-3 items-center w-full sm:w-auto justify-between sm:justify-end">
            <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold flex items-center gap-2 border border-emerald-200">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> LIVE
            </div>
            <button onClick={handleLogout} className="md:hidden px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors">Logout</button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="flex flex-col w-full h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 shrink-0">
              <motion.div whileHover={{ scale: 1.02 }} className="card p-6 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-slate-500 dark:text-slate-400 text-sm mb-1 uppercase tracking-wider font-semibold">Temperature</span>
                  <span className="text-4xl font-bold text-slate-800 dark:text-white">{temperature?.toFixed(1) || "0.0"}<span className="text-2xl font-light text-slate-400 ml-1">°C</span></span>
                </div>
                <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                  <Thermometer size={32} />
                </div>
              </motion.div>

              <motion.div whileHover={{ scale: 1.02 }} className="card p-6 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-slate-500 dark:text-slate-400 text-sm mb-1 uppercase tracking-wider font-semibold">Humidity</span>
                  <span className="text-4xl font-bold text-slate-800 dark:text-white">{humidity?.toFixed(1) || "0.0"}<span className="text-2xl font-light text-slate-400 ml-1">%</span></span>
                </div>
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                  <Droplets size={32} />
                </div>
              </motion.div>
            </div>

            <div className="card p-6 mb-8 shrink-0">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Realtime Sensor Graph</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="time" stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} tickMargin={10} />
                    <YAxis stroke={isDarkMode ? '#94a3b8' : '#64748b'} fontSize={12} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDarkMode ? '#1e293b' : '#fff', borderColor: isDarkMode ? '#334155' : '#e2e8f0', color: isDarkMode ? '#f8fafc' : '#000' }}
                    />
                    <Line type="monotone" dataKey="temp" name="Temp (°C)" stroke="#ea580c" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="hum" name="Humidity (%)" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 shrink-0">
              {[1, 2, 3, 4].map((num) => {
                const relayKey = `Relay${num}`;
                const isOn = relays[relayKey as keyof typeof relays];
                
                return (
                  <div key={relayKey} className="card p-4 flex flex-col items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 uppercase">Relay {num}</span>
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                      <Power size={24} />
                    </div>
                    <label className="relay-toggle">
                      <input type="checkbox" checked={isOn} onChange={() => toggleRelay(relayKey)} />
                      <span className="slider"></span>
                    </label>
                    <span className={`text-[10px] font-bold ${isOn ? 'text-emerald-600' : 'text-slate-400'}`}>
                      STATUS: {isOn ? 'ON' : 'OFF'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Variasi Grid */}
            <div className="card p-6 mb-8 shrink-0">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Relay Sequences (Variasi)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <button onClick={turnOnSequence1} className="w-full px-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors rounded-xl font-semibold text-sm cursor-pointer border border-blue-200">
                  ON Variasi 1 (1-2-3-4)
                </button>
                <button onClick={turnOnSequence2} className="w-full px-4 py-3 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors rounded-xl font-semibold text-sm cursor-pointer border border-blue-200">
                  ON Variasi 2 (4-3-2-1)
                </button>
                <button onClick={stopSequenceAndTurnOff} className="w-full px-4 py-3 bg-red-100 text-red-700 hover:bg-red-200 transition-colors rounded-xl font-semibold text-sm cursor-pointer border border-red-200">
                  Matikan Variasi
                </button>
              </div>
              
              <div className="flex flex-col gap-2">
                 <div className="flex justify-between items-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <span>Kecepatan Variasi (Delay)</span>
                    <span>{sequenceSpeed} ms</span>
                 </div>
                 <input 
                   type="range" 
                   min="50" 
                   max="2000" 
                   step="50" 
                   value={sequenceSpeed} 
                   onChange={handleSpeedChange}
                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-blue-600"
                 />
                 <div className="flex justify-between text-xs text-slate-400">
                    <span>Cepat</span>
                    <span>Lambat</span>
                 </div>
              </div>
            </div>

            <div className="flex-1 min-h-[140px] card p-5 bg-slate-50 dark:bg-slate-800 flex flex-col justify-between border-dashed border-2 border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Mic size={20} className={listening ? "text-blue-500 animate-pulse" : "text-blue-500"} /> 
                    Voice Assistant {listening && "Active"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {listening ? "Listening for commands..." : "Click Start to speak commands"}
                  </p>
                </div>
                {listening ? (
                  <div className="voice-wave cursor-pointer" onClick={toggleListen} title="Stop listening">
                    <div className="wave-bar h-2"></div>
                    <div className="wave-bar h-5"></div>
                    <div className="wave-bar h-3"></div>
                    <div className="wave-bar h-6"></div>
                    <div className="wave-bar h-2"></div>
                  </div>
                ) : (
                    <button onClick={toggleListen} className="px-4 py-2 cursor-pointer bg-blue-100 border border-blue-200 text-blue-700 hover:bg-blue-200 transition-colors rounded-full text-xs font-bold">Start Listening</button>
                )}
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                <div className="bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden shadow-sm">"Nyalakan Relay 1"</div>
                <div className="bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden shadow-sm">"Berapa suhu saat ini?"</div>
                <div className="bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden shadow-sm">"Cek kelembapan"</div>
                <div className="bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap overflow-hidden shadow-sm">"Matikan variasi"</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="card w-full flex-1 flex flex-col overflow-hidden bg-slate-900 border-0 dark:bg-black rounded-lg">
            <div className="flex bg-slate-800 text-slate-400 p-2 text-xs font-mono border-b border-slate-700 items-center justify-between">
              <span>COM3 (IOTT-NODE-01) - 115200 baud</span>
              <button onClick={() => setLogs([])} className="hover:text-slate-200 transition-colors cursor-pointer">Clear Output</button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed text-slate-300">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">Menunggu data...</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="mb-1 flex gap-3 hover:bg-slate-800/50 px-2 py-1 rounded">
                    <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                    <span className={`break-words ${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'warn' ? 'text-orange-400' : 
                      log.type === 'success' ? 'text-emerald-400' : 'text-slate-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
            <div className="bg-slate-800 p-2 flex items-center border-t border-slate-700">
               <input disabled placeholder="Read Only Monitor..." className="flex-1 bg-transparent text-slate-300 font-mono text-xs px-2 outline-none" />
               <Search size={14} className="text-slate-500 mx-2" />
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="card p-6 w-full max-w-xl self-start">
            <h3 className="text-lg font-bold dark:text-white text-slate-800 mb-6 border-b border-slate-200 dark:border-slate-700 pb-2">Appearance</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800 dark:text-white">Dark Mode</h4>
                <p className="text-sm text-slate-500 dark:text-slate-400">Ganti tema tampilan sistem menjadi gelap</p>
              </div>
              
              <button 
                onClick={toggleDarkMode}
                className={`relative inline-flex h-7 w-14 cursor-pointer items-center rounded-full transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform flex items-center justify-center ${isDarkMode ? 'translate-x-8' : 'translate-x-1'}`}>
                  {isDarkMode ? <Moon size={12} className="text-blue-600" /> : <Sun size={12} className="text-amber-500" />}
                </span>
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
