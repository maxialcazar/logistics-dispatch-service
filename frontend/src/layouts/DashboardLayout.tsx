import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-100">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
        <Topbar />

        {/* Main Content Area */}
        <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-6 sm:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
