import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

export function DashboardLayout() {
  return (
    <div className="flex bg-slate-950 font-sans text-slate-100">
      <Sidebar />
      <div className="flex h-screen w-full flex-col">
        <Topbar />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
