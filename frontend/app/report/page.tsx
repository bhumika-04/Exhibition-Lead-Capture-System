'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { requireAuth, getEmployee, hasPermission, isAuthenticated } from '@/lib/auth';
import type { Lead, LeadDetails, Exhibition } from '@/lib/types';
import {
  FileSpreadsheet, Search, Download, Users, Calendar,
  AlertTriangle, Filter, ChevronRight, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/utils';

export default function ReportPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [detailsMap, setDetailsMap] = useState<Map<number, LeadDetails>>(new Map());
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsProgress, setDetailsProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterExhibitionId, setFilterExhibitionId] = useState<number | ''>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterServices, setFilterServices] = useState('');

  // Resizable columns
  const thRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const isResizing = useRef<number | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    try { requireAuth(); } catch { router.push('/auth/login'); return; }
    if (!hasPermission('view_report')) { router.replace('/chat'); return; }
    loadData();
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isResizing.current === null) return;
      const th = thRefs.current[isResizing.current];
      if (!th) return;
      const newWidth = Math.max(60, startWidth.current + (e.clientX - startX.current));
      th.style.minWidth = `${newWidth}px`;
      th.style.width = `${newWidth}px`;
    };
    const onMouseUp = () => { isResizing.current = null; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  const startResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = index;
    startX.current = e.clientX;
    startWidth.current = thRefs.current[index]?.offsetWidth ?? 120;
    document.body.style.cursor = 'col-resize';
  };

  const loadData = async () => {
    try {
      const employee = getEmployee();
      const [leadsResult, exhibitionsResult] = await Promise.all([
        api.getLeads({ limit: 2000, assigned_employee_id: employee?.employee_id }),
        api.getExhibitions(),
      ]);
      const fetchedLeads = leadsResult.leads;
      setLeads(fetchedLeads);
      setExhibitions(exhibitionsResult);
      await fetchAllDetails(fetchedLeads.map((l) => l.lead_id));
    } catch (error) {
      console.error('Failed to load:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllDetails = async (ids: number[]) => {
    const batchSize = 8;
    const map = new Map<number, LeadDetails>();
    let done = 0;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const results = await Promise.all(batch.map((id) => api.getLead(id).catch(() => null)));
      results.forEach((detail, idx) => { if (detail) map.set(batch[idx], detail); });
      done += batch.length;
      setDetailsProgress(Math.min(100, Math.round((done / ids.length) * 100)));
      setDetailsMap(new Map(map));
    }
  };

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (filterExhibitionId !== '') result = result.filter((l) => l.exhibition_id === filterExhibitionId);
    if (filterPriority) result = result.filter((l) => l.priority === filterPriority);
    if (filterStatus) result = result.filter((l) => l.status_code === filterStatus);
    if (filterDateFrom) result = result.filter((l) => new Date(l.created_at) >= new Date(filterDateFrom));
    if (filterDateTo) result = result.filter((l) => new Date(l.created_at) <= new Date(filterDateTo + 'T23:59:59'));
    if (filterServices.trim()) {
      const q = filterServices.toLowerCase();
      result = result.filter((l) => {
        const d = detailsMap.get(l.lead_id);
        return d?.services?.some((s: any) => (s.service_text || s).toLowerCase().includes(q));
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.primary_visitor_name?.toLowerCase().includes(q) ||
          l.company_name?.toLowerCase().includes(q) ||
          l.primary_visitor_phone?.includes(q) ||
          l.primary_visitor_email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [leads, detailsMap, searchQuery, filterExhibitionId, filterPriority, filterStatus, filterDateFrom, filterDateTo, filterServices]);

  const activeFilterCount = [filterExhibitionId !== '', filterPriority, filterStatus, filterDateFrom, filterDateTo, filterServices].filter(Boolean).length;

  const now = new Date();
  const thisMonthCount = leads.filter((l) => {
    const d = new Date(l.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const highPriorityCount = leads.filter((l) => l.priority === 'high').length;
  const crmCount = leads.filter((l) => l.crm_ledger_id).length;

  const fmt = (val?: string | null) => val || '—';
  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  const exportCSV = () => {
    const headers = [
      'S.No', 'Exhibition', 'Company Name', 'Client Name',
      'Services', 'Email', 'Website', 'Post',
      'Address', 'State', 'City', 'Mobile No.',
      'Remark', 'Team Member', 'Priority', 'Created Date',
    ];
    const esc = (val?: string | null) => {
      if (!val) return '';
      return `"${val.replace(/"/g, '""')}"`;
    };
    const rows = filteredLeads.map((lead, i) => {
      const d = detailsMap.get(lead.lead_id);
      const addr = d?.addresses?.[0];
      const web = d?.websites?.[0]?.website_url || '';
      const emailVal = d?.emails?.[0]?.email_address || lead.primary_visitor_email || '';
      const phoneVal = d?.phones?.[0]?.phone_number || lead.primary_visitor_phone || '';
      const services = d?.services?.map((s: any) => s.service_text || s).join('; ') || '';
      return [
        i + 1, esc(lead.exhibition_name), esc(lead.company_name), esc(lead.primary_visitor_name),
        esc(services), esc(emailVal), esc(web), esc(lead.primary_visitor_designation),
        esc(addr?.address_text), esc(addr?.state), esc(addr?.city), esc(phoneVal),
        esc(lead.discussion_summary), esc(lead.assigned_employee_name),
        esc(lead.priority), fmtDate(lead.created_at),
      ].join(',');
    });
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${now.toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLeads.length} leads`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading report data…</p>
          {detailsProgress > 0 && (
            <div className="text-center w-48">
              <p className="text-xs text-slate-400 mb-2">{detailsProgress}% complete</p>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${detailsProgress}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const allDetailsLoaded = detailsProgress === 100 || leads.length === 0;

  const kpiCards = [
    { label: 'Total Leads', value: leads.length, icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', text: 'text-blue-600' },
    { label: 'This Month', value: thisMonthCount, icon: Calendar, iconBg: 'bg-violet-100', iconColor: 'text-violet-600', text: 'text-violet-600' },
    { label: 'High Priority', value: highPriorityCount, icon: AlertTriangle, iconBg: 'bg-rose-100', iconColor: 'text-rose-600', text: 'text-rose-600' },
    { label: 'In CRM', value: crmCount, icon: FileSpreadsheet, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', text: 'text-emerald-600' },
  ];

  // Column definitions: index maps to thRefs
  const COL_SNO = 0;
  const COL_COMPANY = 1;
  const COL_PERSON = 2;
  const snoWidth = 48;
  const companyWidth = 150;
  const personWidth = 130;

  return (
    <div className="bg-slate-50 min-h-full">

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-20 md:min-h-[65px] flex items-center">
        <div className="px-4 md:px-6 py-4 md:py-0 w-full">
          <h1 className="text-xl font-bold text-slate-900">Report &amp; Export</h1>
          <p className="text-xs text-slate-400 mt-0.5">{leads.length} leads total</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpiCards.map(({ label, value, icon: Icon, iconBg, iconColor, text }, i) => (
            <BlurFade key={label} delay={0.05 * i} inView>
              <motion.div
                whileHover={{ y: -3, boxShadow: '0 8px 30px -4px rgba(0,0,0,0.10)' }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', iconBg)}>
                  <Icon className={cn('w-5 h-5', iconColor)} />
                </div>
                <div className={cn('text-2xl font-bold tabular-nums', text)}>
                  <NumberTicker value={value} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
              </motion.div>
            </BlurFade>
          ))}
        </div>

        {/* Toolbar: Search + Filter + Export */}
        <BlurFade delay={0.2} inView>
          <Card className="shadow-sm border-slate-100">
            <CardContent className="px-4 py-3 space-y-3">
              {/* Row */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Search by name, company, phone, email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 rounded-xl border-slate-200 bg-slate-50 focus:bg-white h-9"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  className={cn('h-9 gap-1.5 px-3 rounded-xl border-slate-200 shrink-0', showFilters && 'bg-blue-50 border-blue-200 text-blue-600')}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
                <motion.button
                  onClick={exportCSV}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-1.5 h-9 px-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </motion.button>
                {!allDetailsLoaded && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${detailsProgress}%` }} />
                    </div>
                    <span className="text-xs text-slate-400">{detailsProgress}%</span>
                  </div>
                )}
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Exhibition</label>
                      <select
                        value={filterExhibitionId}
                        onChange={(e) => setFilterExhibitionId(e.target.value ? parseInt(e.target.value) : '')}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      >
                        <option value="">All</option>
                        {exhibitions.map((ex) => (
                          <option key={ex.exhibition_id} value={ex.exhibition_id}>{ex.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Priority</label>
                      <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      >
                        <option value="">All</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      >
                        <option value="">All</option>
                        <option value="new">New</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="needs_correction">Needs Correction</option>
                        <option value="in_progress">In Progress</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Date From</label>
                      <input
                        type="date"
                        value={filterDateFrom}
                        onChange={(e) => setFilterDateFrom(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Date To</label>
                      <input
                        type="date"
                        value={filterDateTo}
                        onChange={(e) => setFilterDateTo(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-1">Services</label>
                      <input
                        type="text"
                        value={filterServices}
                        onChange={(e) => setFilterServices(e.target.value)}
                        placeholder="e.g. Software"
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-slate-700"
                      />
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setFilterExhibitionId(''); setFilterPriority(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterServices(''); }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear all filters
                    </button>
                  )}
                </motion.div>
              )}

              <p className="text-xs text-slate-400">
                Showing <span className="font-semibold text-slate-600">{filteredLeads.length}</span> of {leads.length} leads
                {!allDetailsLoaded && <span className="ml-2 text-blue-500">· loading details {detailsProgress}%</span>}
              </p>
            </CardContent>
          </Card>
        </BlurFade>

        {/* Data Table */}
        <BlurFade delay={0.25} inView>
          <Card className="shadow-sm border-slate-100 overflow-hidden">
            <CardHeader className="pb-0 pt-4 px-5 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-500" />Lead Data
              </CardTitle>
              <span className="text-xs text-slate-400">{filteredLeads.length} rows</span>
            </CardHeader>
            <CardContent className="p-0 mt-3">
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {/* S.No sticky */}
                      <th
                        ref={el => { thRefs.current[COL_SNO] = el; }}
                        className="sticky left-0 bg-slate-50 z-10 px-3 py-3 text-center font-semibold text-slate-500 border-r border-slate-200 select-none relative"
                        style={{ width: snoWidth, minWidth: snoWidth }}
                      >
                        #
                        <span onMouseDown={(e) => startResize(COL_SNO, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400" style={{ opacity: 0.4 }} />
                      </th>
                      {/* Company Name sticky */}
                      <th
                        ref={el => { thRefs.current[COL_COMPANY] = el; }}
                        className="sticky bg-slate-50 z-10 px-3 py-3 text-left font-semibold text-slate-500 border-r border-slate-200 select-none relative"
                        style={{ left: snoWidth, width: companyWidth, minWidth: companyWidth }}
                      >
                        Company Name
                        <span onMouseDown={(e) => startResize(COL_COMPANY, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400" style={{ opacity: 0.4 }} />
                      </th>
                      {/* Client Name sticky */}
                      <th
                        ref={el => { thRefs.current[COL_PERSON] = el; }}
                        className="sticky bg-slate-50 z-10 px-3 py-3 text-left font-semibold text-slate-500 border-r border-slate-200 select-none relative"
                        style={{ left: snoWidth + companyWidth, width: personWidth, minWidth: personWidth }}
                      >
                        Client Name
                        <span onMouseDown={(e) => startResize(COL_PERSON, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400" style={{ opacity: 0.4 }} />
                      </th>
                      {/* Other columns */}
                      {([
                        { i: 3, label: 'Exhibition', w: 130 },
                        { i: 4, label: 'Services', w: 160 },
                        { i: 5, label: 'Email', w: 170 },
                        { i: 6, label: 'Website', w: 140 },
                        { i: 7, label: 'Post', w: 120 },
                        { i: 8, label: 'Address', w: 180 },
                        { i: 9, label: 'State', w: 90 },
                        { i: 10, label: 'City', w: 90 },
                        { i: 11, label: 'Mobile', w: 120 },
                        { i: 12, label: 'Remark', w: 200 },
                        { i: 13, label: 'Team Member', w: 110 },
                        { i: 14, label: 'Created', w: 95 },
                      ] as { i: number; label: string; w: number }[]).map(({ i, label, w }) => (
                        <th
                          key={i}
                          ref={el => { thRefs.current[i] = el; }}
                          className="px-3 py-3 text-left font-semibold text-slate-500 relative select-none"
                          style={{ width: w, minWidth: w }}
                        >
                          {label}
                          <span onMouseDown={(e) => startResize(i, e)} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400" style={{ opacity: 0.4 }} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={15} className="px-4 py-12 text-center text-slate-300">
                          <FileSpreadsheet className="w-8 h-8 mx-auto mb-2" /><p>No leads found</p>
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead, index) => {
                        const d = detailsMap.get(lead.lead_id);
                        const addr = d?.addresses?.[0];
                        const web = d?.websites?.[0]?.website_url;
                        const email = d?.emails?.[0]?.email_address || lead.primary_visitor_email;
                        const phone = d?.phones?.[0]?.phone_number || lead.primary_visitor_phone;
                        const services = d?.services?.map((s: any) => s.service_text || s).join(', ');
                        const lc = !d ? <span className="inline-block w-12 h-2 bg-slate-200 rounded animate-pulse" /> : null;

                        return (
                          <tr
                            key={lead.lead_id}
                            onClick={() => router.push(`/leads/${lead.lead_id}`)}
                            className="border-b border-slate-100 hover:bg-blue-50/60 cursor-pointer transition-colors group"
                          >
                            {/* S.No sticky */}
                            <td className="sticky left-0 bg-white z-10 px-3 py-2.5 text-center font-semibold text-slate-400 border-r border-slate-200 group-hover:bg-blue-50/60 transition-colors">
                              <div className="flex items-center justify-center gap-1">
                                {index + 1}
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                              </div>
                            </td>
                            {/* Company Name sticky */}
                            <td
                              className="sticky bg-white z-10 px-3 py-2.5 font-medium text-slate-800 border-r border-slate-200 group-hover:bg-blue-50/60 transition-colors"
                              style={{ left: snoWidth }}
                            >
                              <span className="block truncate" style={{ maxWidth: companyWidth - 24 }} title={lead.company_name ?? undefined}>{fmt(lead.company_name)}</span>
                            </td>
                            {/* Client Name sticky */}
                            <td
                              className="sticky bg-white z-10 px-3 py-2.5 font-medium text-slate-700 border-r border-slate-200 group-hover:bg-blue-50/60 transition-colors"
                              style={{ left: snoWidth + companyWidth }}
                            >
                              <span className="block truncate" style={{ maxWidth: personWidth - 24 }} title={lead.primary_visitor_name ?? undefined}>{fmt(lead.primary_visitor_name)}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600"><span className="block truncate" style={{ maxWidth: 130 }} title={lead.exhibition_name ?? undefined}>{fmt(lead.exhibition_name)}</span></td>
                            <td className="px-3 py-2.5 text-slate-600">{!d ? lc : services ? <span className="block truncate" style={{ maxWidth: 160 }} title={services}>{services}</span> : <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-2.5 text-slate-600">{!d ? lc : <span className="block truncate" style={{ maxWidth: 170 }} title={email ?? undefined}>{fmt(email)}</span>}</td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {!d ? lc : web ? (
                                <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="block truncate text-blue-600 hover:underline" style={{ maxWidth: 140 }} title={web}>{web}</a>
                              ) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600"><span className="block truncate" style={{ maxWidth: 120 }}>{fmt(lead.primary_visitor_designation)}</span></td>
                            <td className="px-3 py-2.5 text-slate-600">{!d ? lc : <span className="block truncate" style={{ maxWidth: 180 }} title={addr?.address_text ?? undefined}>{fmt(addr?.address_text)}</span>}</td>
                            <td className="px-3 py-2.5 text-slate-600">{!d ? lc : fmt(addr?.state)}</td>
                            <td className="px-3 py-2.5 text-slate-600">{!d ? lc : fmt(addr?.city)}</td>
                            <td className="px-3 py-2.5 font-medium text-blue-600 whitespace-nowrap">{fmt(phone)}</td>
                            <td className="px-3 py-2.5 text-slate-600"><span className="block truncate" style={{ maxWidth: 200 }} title={lead.discussion_summary ?? undefined}>{fmt(lead.discussion_summary)}</span></td>
                            <td className="px-3 py-2.5 text-slate-600"><span className="block truncate" style={{ maxWidth: 110 }}>{fmt(lead.assigned_employee_name)}</span></td>
                            <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmtDate(lead.created_at)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </BlurFade>

        <div className="md:hidden h-16" />
      </div>
    </div>
  );
}
