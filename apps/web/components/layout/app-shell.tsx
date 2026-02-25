'use client';

import { SidebarInset, SidebarProvider } from '@repo/ui';
import { AppNavbar } from './app-navbar';
import { AppSidebar } from './app-sidebar';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col">
      {/* Full-width navbar at top */}
      <AppNavbar />

      {/* Sidebar and content below navbar */}
      <div className="flex flex-1 overflow-hidden [&_[data-slot=sidebar-container]]:top-14 [&_[data-slot=sidebar-container]]:h-[calc(100svh-3.5rem)] [&_[data-slot=sidebar-wrapper]]:min-h-0">
        <SidebarProvider defaultOpen={true}>
          <AppSidebar />
          <SidebarInset className="bg-background">
            <main className="flex h-full flex-1 flex-col overflow-hidden">
              <div className="container mx-auto h-full max-w-6xl flex-1 overflow-auto px-6">
                {children}
              </div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}
