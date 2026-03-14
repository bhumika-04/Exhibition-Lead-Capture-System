'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ScanLine, Building2, Users, BarChart3, FileSpreadsheet } from 'lucide-react';
import { getEmployee, hasPermission } from '@/lib/auth';

// permission: null = always show
const ALL_NAV_ITEMS = [
  { name: 'Scan',        path: '/chat',        icon: ScanLine,       permission: null },
  { name: 'Leads',       path: '/leads',       icon: Users,          permission: 'view_leads' },
  { name: 'Dashboard',   path: '/dashboard',   icon: BarChart3,      permission: 'view_dashboard' },
  { name: 'Exhibitions', path: '/exhibitions', icon: Building2,      permission: 'view_exhibitions' },
  { name: 'Report',      path: '/report',      icon: FileSpreadsheet, permission: 'view_report' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [initial, setInitial] = useState('U');
  const [navItems, setNavItems] = useState(ALL_NAV_ITEMS);

  useEffect(() => {
    const emp = getEmployee();
    setInitial(emp?.full_name?.trim().charAt(0).toUpperCase() || 'U');
    setNavItems(ALL_NAV_ITEMS.filter(item =>
      item.permission === null || hasPermission(item.permission)
    ));
  }, []);

  const isProfileActive = pathname === '/profile';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-16 w-full">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 transform active:scale-95 ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className={`w-5 h-5 mb-1 transition-all duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[10px] font-medium">{item.name}</span>
              {isActive && (
                <div className="absolute bottom-0 w-10 h-1 bg-blue-600 rounded-t-full" />
              )}
            </button>
          );
        })}

        {/* Profile avatar button */}
        <button
          onClick={() => router.push('/profile')}
          className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 transform active:scale-95 ${
            isProfileActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <div className={`w-5 h-5 mb-1 rounded-full flex items-center justify-center text-[11px] font-bold text-white transition-all duration-200 ${
            isProfileActive ? 'bg-blue-600 scale-110' : 'bg-gray-400'
          }`}>
            {initial}
          </div>
          <span className="text-[10px] font-medium">Profile</span>
          {isProfileActive && (
            <div className="absolute bottom-0 w-10 h-1 bg-blue-600 rounded-t-full" />
          )}
        </button>
      </div>
    </nav>
  );
}
