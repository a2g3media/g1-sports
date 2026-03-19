import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemoAuth, DevRole } from "@/react-app/contexts/DemoAuthContext";

import { Shield, Loader2, User, ShieldCheck, Crown, Code, Zap, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/react-app/lib/utils";

// Cinematic background with ambient orbs
function CinematicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Deep gradient base */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />
      
      {/* Ambient glow orbs */}
      <div 
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
        style={{ 
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
          animationDuration: '4s'
        }}
      />
      <div 
        className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full blur-[120px] animate-pulse"
        style={{ 
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
          animationDuration: '5s',
          animationDelay: '1s'
        }}
      />
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[150px] opacity-30"
        style={{ 
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 60%)',
        }}
      />
      
      {/* Subtle grid overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />
      
      {/* Top vignette */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 to-transparent" />
      
      {/* Bottom vignette */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/40 to-transparent" />
    </div>
  );
}

export function Login() {
  const navigate = useNavigate();
  const { user, isPending, enterDevMode, isDemoMode } = useDemoAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-redirect if user is authenticated (but NOT if in demo mode - allow role switching)
  useEffect(() => {
    if (!isPending && user && !isDemoMode) {
      navigate("/", { replace: true });
    }
  }, [user, isPending, navigate, isDemoMode]);

  const handleDevLogin = (role: DevRole) => {
    enterDevMode(role);
    const destinations: Record<DevRole, string> = {
      user: "/",
      pool_admin: "/pool-admin",
      super_admin: "/admin",
    };
    setTimeout(() => {
      navigate(destinations[role], { replace: true });
    }, 50);
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <CinematicBackground />
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative">
      <CinematicBackground />

      <div className="w-full max-w-md space-y-8 relative z-10">
        {/* Logo Section */}
        <div 
          className={cn(
            "text-center space-y-4 transition-all duration-700",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
        >
          {/* Premium logo mark */}
          <div className="relative inline-flex items-center justify-center">
            <div className="absolute inset-0 w-20 h-20 bg-emerald-500/20 rounded-2xl blur-xl animate-pulse" style={{ animationDuration: '3s' }} />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-transform duration-300 hover:scale-105">
              <Shield className="h-8 w-8 text-white" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              GZ SPORTS
            </h1>
            <p className="text-slate-400 text-sm">
              Your edge in sports intelligence
            </p>
          </div>
        </div>

        {/* Main Glass Card */}
        <div 
          className={cn(
            "relative transition-all duration-700 delay-100",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
        >
          {/* Glow effect behind card */}
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-transparent to-blue-500/20 rounded-3xl blur-xl opacity-50" />
          
          {/* Glass card */}
          <div className="relative bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50">
            {/* Inner glow */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            
            <div className="relative space-y-6">
              <div className="text-center">
                <h2 className="font-semibold text-lg text-white">Welcome Back</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Choose your access level to continue
                </p>
              </div>
              
              {/* Dev Login Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <Code className="h-4 w-4" />
                  <span>Quick Access</span>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <button 
                    onClick={() => handleDevLogin("user")} 
                    className={cn(
                      "group relative h-24 rounded-xl transition-all duration-300",
                      "bg-white/[0.03] border border-white/10 hover:border-blue-500/50",
                      "hover:bg-blue-500/10 active:scale-[0.98]"
                    )}
                  >
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                        <User className="h-5 w-5 text-blue-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-300">User</span>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => handleDevLogin("pool_admin")} 
                    className={cn(
                      "group relative h-24 rounded-xl transition-all duration-300",
                      "bg-white/[0.03] border border-white/10 hover:border-amber-500/50",
                      "hover:bg-amber-500/10 active:scale-[0.98]"
                    )}
                  >
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                        <ShieldCheck className="h-5 w-5 text-amber-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-300">Admin</span>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => handleDevLogin("super_admin")} 
                    className={cn(
                      "group relative h-24 rounded-xl transition-all duration-300",
                      "bg-white/[0.03] border border-white/10 hover:border-purple-500/50",
                      "hover:bg-purple-500/10 active:scale-[0.98]"
                    )}
                  >
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex flex-col items-center justify-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                        <Crown className="h-5 w-5 text-purple-400" />
                      </div>
                      <span className="text-xs font-medium text-slate-300">Super</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-transparent px-3 text-slate-500">
                    Full feature access
                  </span>
                </div>
              </div>

              {/* Features list */}
              <ul className="text-sm text-slate-400 space-y-2">
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Zap className="h-3 w-3 text-emerald-400" />
                  </div>
                  <span>AI-powered sports insights</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Trophy className="h-3 w-3 text-emerald-400" />
                  </div>
                  <span>Create and join pools</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                  </div>
                  <span>Track picks and standings</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Feature Pills */}
        <div 
          className={cn(
            "flex flex-wrap justify-center gap-3 transition-all duration-700 delay-200",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
        >
          {[
            { icon: Shield, label: "Secure" },
            { icon: Zap, label: "Real-time" },
            { icon: Trophy, label: "Competitive" },
          ].map(({ icon: Icon, label }, i) => (
            <div 
              key={label}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-slate-400"
              style={{ animationDelay: `${300 + i * 100}ms` }}
            >
              <Icon className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>

        {/* Trust line */}
        <div 
          className={cn(
            "flex items-center justify-center gap-2 text-xs text-slate-500 transition-all duration-700 delay-300",
            mounted ? "opacity-100" : "opacity-0"
          )}
        >
          <Shield className="h-3.5 w-3.5 text-emerald-500/50" />
          <span>Powered by Coach G Intelligence</span>
        </div>
      </div>
    </div>
  );
}
