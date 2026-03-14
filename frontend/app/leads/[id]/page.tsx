'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { requireAuth, getEmployee, hasPermission } from '@/lib/auth';
import type { LeadDetails } from '@/lib/types';
import {
  ArrowLeft, Edit3, Check, X, Phone, Mail, Building2, Globe,
  MapPin, Users, MessageSquare, Zap, Loader2, CheckCircle2,
  Upload, Tag,
} from 'lucide-react';
// Note: Upload kept for Push to CRM button
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = parseInt(params.id as string);

  const canPushToCrm = hasPermission('push_to_crm');

  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushingToCrm, setPushingToCrm] = useState(false);
  const [showCrmConfirm, setShowCrmConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    primary_visitor_name: '',
    primary_visitor_designation: '',
    primary_visitor_phone: '',
    primary_visitor_email: '',
    company_name: '',
  });

  useEffect(() => {
    try { requireAuth(); } catch { router.push('/auth/login'); return; }
    if (!hasPermission('view_leads')) { router.replace('/chat'); return; }
    loadLead();
  }, [leadId]);

  const loadLead = async () => {
    try {
      const data = await api.getLead(leadId);
      setLead(data);
      setEditForm({
        primary_visitor_name: data.primary_visitor_name || '',
        primary_visitor_designation: data.primary_visitor_designation || '',
        primary_visitor_phone: data.primary_visitor_phone || '',
        primary_visitor_email: data.primary_visitor_email || '',
        company_name: data.company_name || '',
      });
    } catch { console.error('Failed to load lead'); }
    finally { setLoading(false); }
  };

  const handleEditToggle = () => {
    if (isEditing && lead) {
      setEditForm({
        primary_visitor_name: lead.primary_visitor_name || '',
        primary_visitor_designation: lead.primary_visitor_designation || '',
        primary_visitor_phone: lead.primary_visitor_phone || '',
        primary_visitor_email: lead.primary_visitor_email || '',
        company_name: lead.company_name || '',
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSaveEdit = async () => {
    try {
      await api.updateLead(leadId, editForm);
      toast.success('Lead updated');
      setIsEditing(false);
      await loadLead();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to update lead');
    }
  };

  const handleWhatsApp = () => {
    if (!lead) return;
    const phone = lead.primary_visitor_phone || lead.phones?.[0]?.phone_number;
    if (!phone) { toast.error('No phone number found'); return; }
    const digits = phone.replace(/[^0-9]/g, '');
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    const employee = getEmployee();
    const name = lead.primary_visitor_name || 'there';
    const company = lead.company_name ? ` (${lead.company_name})` : '';
    const exhibition = lead.exhibition_name ? `the ${lead.exhibition_name} exhibition` : 'the exhibition';
    const sender = employee?.full_name ?? '';
    const senderCompany = employee?.company_name ?? '';
    const defaultTemplate =
      `Hello {name}{company},\n\nIt was great meeting you at {exhibition}! We are glad to have connected with you.\n\nLooking forward to staying in touch.\n\nBest regards,\n{sender}\n{sender_company}`;
    const template = localStorage.getItem('whatsapp_template') || defaultTemplate;
    const message = template
      .replace('{name}', name)
      .replace('{company}', company)
      .replace('{exhibition}', exhibition)
      .replace('{sender}', sender)
      .replace('{sender_company}', senderCompany);
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleAddToContact = async () => {
    if (!lead) return;
    const escape = (v?: string) => (v || '').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    const name = lead.primary_visitor_name || lead.persons?.[0]?.name || '';
    const display = [lead.company_name, name].filter(Boolean).join(' - ');
    if (display) { lines.push(`FN:${escape(display)}`); lines.push(`N:${escape(name)};;;;`); }
    if (lead.company_name) lines.push(`ORG:${escape(lead.company_name)}`);
    const desig = lead.primary_visitor_designation || lead.persons?.[0]?.designation || '';
    if (desig) lines.push(`TITLE:${escape(desig)}`);
    const allPhones = new Set<string>();
    if (lead.primary_visitor_phone) allPhones.add(lead.primary_visitor_phone);
    lead.phones?.forEach(p => p.phone_number && allPhones.add(p.phone_number));
    Array.from(allPhones).forEach((ph, i) => lines.push(`TEL;TYPE=${i === 0 ? 'CELL' : 'WORK'}:${escape(ph)}`));
    const allEmails = new Set<string>();
    if (lead.primary_visitor_email) allEmails.add(lead.primary_visitor_email);
    lead.emails?.forEach(e => e.email_address && allEmails.add(e.email_address));
    Array.from(allEmails).forEach(em => lines.push(`EMAIL:${escape(em)}`));
    lead.addresses?.forEach(addr => {
      lines.push(`ADR;TYPE=${addr.address_type?.toUpperCase() || 'WORK'}:;;${escape(addr.address_text)};${escape(addr.city)};${escape(addr.state)};;${escape(addr.country)}`);
    });
    lead.websites?.forEach(w => w.website_url && lines.push(`URL:${w.website_url}`));
    if (lead.discussion_summary) lines.push(`NOTE:${escape(lead.discussion_summary)}`);
    lines.push('END:VCARD');
    const vcf = lines.join('\r\n');
    const filename = `${(display || 'contact').replace(/\s+/g, '_')}.vcf`;
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], filename, { type: 'text/vcard' });
      if (navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return; }
        catch (err: any) { if (err?.name === 'AbortError') return; }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success('Contact saved — open to import');
  };

  const handlePushToCrm = async () => {
    if (!lead) return;
    if (lead.crm_ledger_id) {
      toast(`Already in CRM — Ledger ID: ${lead.crm_ledger_id}`, { icon: 'ℹ️' });
      return;
    }

    setShowCrmConfirm(true);
  };

  const executePushToCrm = async () => {
    setShowCrmConfirm(false);
    setPushingToCrm(true);
    try {
      const result = await api.pushToCrm(leadId);
      if (result.success) { toast.success(`Pushed! Ledger: ${result.ledger_code}`); await loadLead(); }
      else toast.error(result.error || 'Push failed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Push failed');
    } finally { setPushingToCrm(false); }
  };

  const openEmail = async (email: string) => {
    // Set href synchronously so browser treats it as a direct user-gesture
    window.location.href = `mailto:${email}`;
    // Also copy to clipboard as fallback (if mail client isn't configured)
    try {
      await navigator.clipboard.writeText(email);
      toast.success(`Copied to clipboard: ${email}`, { duration: 3000 });
    } catch {
      toast(email, { icon: '✉️', duration: 3000 });
    }
  };

  // ── Loading / not found ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-slate-600 mb-3">Lead not found</p>
          <Button variant="outline" onClick={() => router.push('/leads')}>Back to Leads</Button>
        </div>
      </div>
    );
  }

  const initials = (lead.primary_visitor_name || lead.company_name || '?')
    .split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase();

  const priorityColor = lead.priority === 'high' ? 'text-red-500' : lead.priority === 'medium' ? 'text-amber-500' : 'text-emerald-500';

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 focus:bg-white transition';

  return (
    <div className="bg-slate-50 min-h-full">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-sm border-b border-slate-200">
        <div className="px-4 md:px-6 py-3.5 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="h-8 w-8 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {lead.primary_visitor_name || 'Lead Details'}
            </p>
            {lead.company_name && (
              <p className="text-xs text-slate-400 truncate">{lead.company_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <Button size="sm" variant="ghost" onClick={handleEditToggle} className="h-8 text-xs gap-1">
                  <X className="w-3.5 h-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700">
                  <Check className="w-3.5 h-3.5" /> Save
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={handleEditToggle} className="h-8 text-xs gap-1">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 md:px-6 py-5 pb-24 md:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── RIGHT COLUMN (shown first on mobile) ── */}
          <div className="space-y-4 lg:hidden">
            {((lead.services?.length ?? 0) > 0 || lead.priority) && (
              <BlurFade delay={0.05} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Zap className="w-4 h-4 text-indigo-600" />
                      </span>
                      Lead Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {(lead.services?.length ?? 0) > 0 && (
                        <div className="p-3 bg-indigo-50 rounded-xl">
                          <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1">Services</p>
                          <p className="font-semibold text-indigo-700 text-sm leading-snug">{lead.services.map(s => s.service_text).join(', ')}</p>
                        </div>
                      )}
                      {lead.priority && (
                        <div className={cn('p-3 rounded-xl', {
                          'bg-red-50': lead.priority === 'high',
                          'bg-amber-50': lead.priority === 'medium',
                          'bg-emerald-50': lead.priority === 'low',
                        })}>
                          <p className={cn('text-[10px] font-semibold uppercase tracking-wide mb-1', priorityColor)}>Priority</p>
                          <p className={cn('font-semibold capitalize text-sm', priorityColor)}>{lead.priority}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            <BlurFade delay={0.08} inView>
              <Card className="shadow-sm border-slate-100">
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-600" />
                    </span>
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-2">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={handleWhatsApp}
                      disabled={!lead.primary_visitor_phone && !lead.phones?.length}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl font-semibold text-xs transition-all',
                        !lead.primary_visitor_phone && !lead.phones?.length
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      )}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      WhatsApp
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={handleAddToContact}
                      disabled={!lead.primary_visitor_name && !lead.primary_visitor_phone && !lead.company_name}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl font-semibold text-xs transition-all',
                        !lead.primary_visitor_name && !lead.primary_visitor_phone && !lead.company_name
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      )}
                    >
                      <Users className="w-5 h-5" />Save Contact
                    </motion.button>
                    {canPushToCrm && (
                      <motion.button
                        whileTap={!lead.crm_ledger_id && !pushingToCrm ? { scale: 0.96 } : {}}
                        onClick={handlePushToCrm}
                        disabled={pushingToCrm}
                        className={cn(
                          'col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
                          lead.crm_ledger_id
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : pushingToCrm
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                        )}
                      >
                        {pushingToCrm ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Pushing…</>
                        ) : lead.crm_ledger_id ? (
                          <><CheckCircle2 className="w-4 h-4" />In CRM (ID: {lead.crm_ledger_id})</>
                        ) : (
                          <><Upload className="w-4 h-4" />Push to CRM / ERP</>
                        )}
                      </motion.button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </BlurFade>

            <BlurFade delay={0.1} inView>
              <Card className="shadow-sm border-slate-100">
                <CardContent className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-500">Status</span>
                      <Badge variant={lead.status_code === 'confirmed' ? 'default' : 'secondary'}>
                        {lead.status_name || lead.status_code}
                      </Badge>
                    </div>
                    {lead.source_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Source</span>
                        <span className="text-slate-700 font-medium">{lead.source_name}</span>
                      </div>
                    )}
                    <span className="text-slate-400 font-mono text-xs">#{lead.lead_id}</span>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          </div>

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Contact Information */}
            <BlurFade delay={0.1} inView>
              <Card className="shadow-sm border-slate-100">
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-7 h-7 bg-violet-100 rounded-lg flex items-center justify-center">
                      <Users className="w-4 h-4 text-violet-600" />
                    </span>
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {isEditing ? (
                    <div className="space-y-3">
                      {[
                        { label: 'Name', key: 'primary_visitor_name', type: 'text', placeholder: 'Visitor name' },
                        { label: 'Designation', key: 'primary_visitor_designation', type: 'text', placeholder: 'Job title' },
                        { label: 'Company', key: 'company_name', type: 'text', placeholder: 'Company name' },
                        { label: 'Phone', key: 'primary_visitor_phone', type: 'tel', placeholder: 'Phone number' },
                        { label: 'Email', key: 'primary_visitor_email', type: 'email', placeholder: 'Email address' },
                      ].map(({ label, key, type, placeholder }) => (
                        <div key={key}>
                          <label className="text-xs font-semibold text-slate-500 mb-1 block">{label}</label>
                          <input
                            type={type}
                            value={(editForm as any)[key]}
                            onChange={e => setEditForm({ ...editForm, [key]: e.target.value })}
                            className={inputCls}
                            placeholder={placeholder}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-base shrink-0">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-base">{lead.primary_visitor_name || '—'}</p>
                          {lead.primary_visitor_designation && (
                            <p className="text-sm text-slate-500">{lead.primary_visitor_designation}</p>
                          )}
                          {lead.company_name && (
                            <p className="text-sm font-semibold text-blue-600 mt-1 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" />{lead.company_name}
                            </p>
                          )}
                          {lead.exhibition_name && (
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{lead.exhibition_name}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {lead.primary_visitor_phone && (
                          <a href={`tel:${lead.primary_visitor_phone}`}
                            className="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100 rounded-xl transition group">
                            <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                              <Phone className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-400">Phone</p>
                              <p className="text-sm font-semibold text-blue-700">{lead.primary_visitor_phone}</p>
                            </div>
                          </a>
                        )}
                        {lead.primary_visitor_email && (
                          <button
                            onClick={() => openEmail(lead.primary_visitor_email!)}
                            className="w-full flex items-center gap-3 p-3 bg-violet-50 hover:bg-violet-100 rounded-xl transition text-left">
                            <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
                              <Mail className="w-4 h-4 text-violet-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-slate-400">Email · tap to compose</p>
                              <p className="text-sm font-semibold text-violet-700 truncate">{lead.primary_visitor_email}</p>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </BlurFade>

            {/* Company */}
            <BlurFade delay={0.15} inView>
              <Card className="shadow-sm border-slate-100">
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <Building2 className="w-4 h-4 text-emerald-600" />
                    </span>
                    Company
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-3">
                  <p className="font-semibold text-slate-800">{lead.company_name || '—'}</p>
                  {lead.websites?.map(w => w.website_url && (
                    <a key={w.lead_website_id}
                      href={w.website_url.startsWith('http') ? w.website_url : `https://${w.website_url}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                      <Globe className="w-3.5 h-3.5 shrink-0" />{w.website_url}
                    </a>
                  ))}
                  {lead.addresses?.map(addr => (
                    <div key={addr.lead_address_id} className="text-sm text-slate-600">
                      {addr.address_type && (
                        <Badge variant="secondary" className="text-[10px] mb-1">{addr.address_type}</Badge>
                      )}
                      <p className="flex items-start gap-1 mt-1"><MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />{addr.address_text}</p>
                      {addr.city && <p className="text-slate-400 text-xs ml-5">{addr.city}{addr.state && `, ${addr.state}`}</p>}
                    </div>
                  ))}
                  {lead.services?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Products / Services</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.services.map(s => (
                          <Badge key={s.lead_service_id} variant="secondary" className="text-xs">{s.service_text}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </BlurFade>

            {/* Additional phones + emails */}
            {((lead.phones?.length ?? 0) > 0 || (lead.emails?.length ?? 0) > 0) && (
              <BlurFade delay={0.2} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700">All Contact Details</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2">
                    {lead.phones?.map(p => (
                      <a key={p.lead_phone_id} href={`tel:${p.phone_number}`}
                        className="flex items-center justify-between p-2.5 bg-green-50 rounded-xl hover:bg-green-100 transition">
                        <span className="text-sm font-medium text-green-700 flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5" />{p.phone_number}
                        </span>
                        {p.phone_type && <Badge variant="secondary" className="text-[10px]">{p.phone_type}</Badge>}
                      </a>
                    ))}
                    {lead.emails?.map(e => (
                      <button key={e.lead_email_id}
                        onClick={() => openEmail(e.email_address)}
                        className="w-full flex items-center p-2.5 bg-orange-50 rounded-xl hover:bg-orange-100 transition text-left">
                        <Mail className="w-3.5 h-3.5 text-orange-500 mr-2 shrink-0" />
                        <span className="text-sm font-medium text-orange-700 break-all">{e.email_address}</span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Brands */}
            {(lead.brands?.length ?? 0) > 0 && (
              <BlurFade delay={0.22} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Tag className="w-4 h-4 text-violet-500" />Associated Brands
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2">
                    {lead.brands?.map(b => (
                      <div key={b.lead_brand_id} className="flex items-center justify-between p-2.5 bg-violet-50 rounded-xl">
                        <span className="font-medium text-violet-900 text-sm">{b.brand_name}</span>
                        {b.relationship && <Badge variant="secondary" className="text-[10px]">{b.relationship}</Badge>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Additional contacts */}
            {lead.persons?.length > 0 && (
              <BlurFade delay={0.24} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-500" />Additional Contacts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2">
                    {lead.persons.map(p => (
                      <div key={p.lead_person_id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl">
                        <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                          {p.name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{p.name}</p>
                          {p.designation && <p className="text-xs text-slate-400">{p.designation}</p>}
                          {p.phone && <p className="text-xs text-blue-600">{p.phone}</p>}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Discussion */}
            {lead.discussion_summary && (
              <BlurFade delay={0.26} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-500" />Discussion Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <p className="text-sm text-slate-600 leading-relaxed">{lead.discussion_summary}</p>
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Messages */}
            {lead.messages?.length > 0 && (
              <BlurFade delay={0.28} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700">Conversation History</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {lead.messages.map(msg => (
                        <div key={msg.message_id}
                          className={cn('p-3 rounded-xl text-sm', {
                            'bg-slate-100 text-slate-500 text-center': msg.sender_type === 'system',
                            'bg-blue-50 text-blue-900 ml-8': msg.sender_type === 'employee',
                            'bg-slate-50 text-slate-900 mr-8': msg.sender_type !== 'system' && msg.sender_type !== 'employee',
                          })}>
                          <p className="whitespace-pre-wrap">{msg.message_text}</p>
                          <p className="text-[10px] text-slate-400 mt-1" suppressHydrationWarning>
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </BlurFade>
            )}
          </div>

          {/* ── RIGHT COLUMN (desktop only) ── */}
          <div className="space-y-4 hidden lg:block">

            {/* Lead Intelligence */}
            {((lead.services?.length ?? 0) > 0 || lead.priority) && (
              <BlurFade delay={0.08} inView>
                <Card className="shadow-sm border-slate-100">
                  <CardHeader className="pb-3 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <span className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Zap className="w-4 h-4 text-indigo-600" />
                      </span>
                      Lead Intelligence
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2">
                    {(lead.services?.length ?? 0) > 0 && (
                      <div className="p-3 bg-indigo-50 rounded-xl">
                        <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-1">Services</p>
                        <p className="font-semibold text-indigo-700 text-sm leading-snug">{lead.services.map(s => s.service_text).join(', ')}</p>
                      </div>
                    )}
                    {lead.priority && (
                      <div className={cn('p-3 rounded-xl', {
                        'bg-red-50': lead.priority === 'high',
                        'bg-amber-50': lead.priority === 'medium',
                        'bg-emerald-50': lead.priority === 'low',
                      })}>
                        <p className={cn('text-[10px] font-semibold uppercase tracking-wide mb-1', priorityColor)}>Priority</p>
                        <p className={cn('font-semibold capitalize text-sm', priorityColor)}>{lead.priority}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </BlurFade>
            )}

            {/* Quick Actions */}
            <BlurFade delay={0.12} inView>
              <Card className="shadow-sm border-slate-100">
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Zap className="w-4 h-4 text-blue-600" />
                    </span>
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-2.5">
                  {/* WhatsApp */}
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleWhatsApp}
                    disabled={!lead.primary_visitor_phone && !lead.phones?.length}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
                      !lead.primary_visitor_phone && !lead.phones?.length
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    )}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    {!lead.primary_visitor_phone && !lead.phones?.length ? 'No Phone' : 'Send WhatsApp'}
                  </motion.button>

                  {/* Add to Contact */}
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleAddToContact}
                    disabled={!lead.primary_visitor_name && !lead.primary_visitor_phone && !lead.company_name}
                    className={cn(
                      'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
                      !lead.primary_visitor_name && !lead.primary_visitor_phone && !lead.company_name
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    )}
                  >
                    <Users className="w-4 h-4" />Add to Contacts
                  </motion.button>

                  {/* Push to CRM */}
                  {canPushToCrm && (
                    <motion.button
                      whileHover={!lead.crm_ledger_id && !pushingToCrm ? { scale: 1.02 } : {}}
                      whileTap={!lead.crm_ledger_id && !pushingToCrm ? { scale: 0.98 } : {}}
                      onClick={handlePushToCrm}
                      disabled={pushingToCrm}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all',
                        lead.crm_ledger_id
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : pushingToCrm
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      )}
                    >
                      {pushingToCrm ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />Pushing…</>
                      ) : lead.crm_ledger_id ? (
                        <><CheckCircle2 className="w-4 h-4" />In CRM (ID: {lead.crm_ledger_id})</>
                      ) : (
                        <><Upload className="w-4 h-4" />Push to CRM / ERP</>
                      )}
                    </motion.button>
                  )}
                </CardContent>
              </Card>
            </BlurFade>

            {/* Status info */}
            <BlurFade delay={0.16} inView>
              <Card className="shadow-sm border-slate-100">
                <CardContent className="px-5 py-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Status</span>
                    <Badge variant={lead.status_code === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
                      {lead.status_name || lead.status_code}
                    </Badge>
                  </div>
                  {lead.source_name && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 text-xs font-medium uppercase tracking-wide">Source</span>
                      <span className="text-slate-700 font-medium text-sm">{lead.source_name}</span>
                    </div>
                  )}
                  {lead.exhibition_name && (
                    <div className="flex items-start justify-between text-sm gap-2">
                      <span className="text-slate-500 text-xs font-medium uppercase tracking-wide shrink-0">Exhibition</span>
                      <span className="text-slate-700 font-medium text-xs text-right">{lead.exhibition_name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-slate-100">
                    <span className="text-slate-400 text-xs">Lead ID</span>
                    <span className="text-slate-400 font-mono text-xs">#{lead.lead_id}</span>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>

          </div>
        </div>
      </div>

      {/* ── CRM Push Confirmation Modal ── */}
      {showCrmConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 flex flex-col gap-5"
          >
            <div className="flex flex-col gap-1.5">
              <p className="text-lg font-bold text-slate-900">Push to CRM / ERP?</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                This will create a new Ledger Client in the ERP system for <span className="font-semibold text-slate-700">{lead?.company_name || lead?.primary_visitor_name || 'this lead'}</span>.
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 py-5 text-sm" onClick={() => setShowCrmConfirm(false)}>
                Cancel
              </Button>
              <Button className="flex-1 py-5 text-sm bg-orange-500 hover:bg-orange-600 text-white" onClick={executePushToCrm}>
                Push to CRM
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
