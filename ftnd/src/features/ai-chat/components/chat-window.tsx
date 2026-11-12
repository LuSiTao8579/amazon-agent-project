'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, Paper, Stack, Typography } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import type { RecentHistory } from '../types';
import MessageList from './message-list';
import ChatInput from './chat-input';
import SessionManager from './session-manager';
import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from '../upload-policy';

type Props = { onClose: () => void };

/** 非模态浮窗：用户仍可切换工作台页面；Escape 和关闭按钮都可以关闭。 */
export default function ChatWindow({ onClose }: Props) {
  const [history, setHistory] = useState<RecentHistory | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [managing, setManaging] = useState(false);
  const drafts = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState<'sending' | 'uploading' | null>(null);
  const busyRef = useRef(false);
  const pendingRequests = useRef<Record<string, { id: string; text: string }>>({});
  const bottom = useRef<HTMLDivElement>(null);

  const selectedKey = 'ai-chat-selected-session';
  function selectedSession() { try { return sessionStorage.getItem(selectedKey); } catch { return null; } }
  function rememberSession(id: string | null) { try { if (id) sessionStorage.setItem(selectedKey, id); else sessionStorage.removeItem(selectedKey); } catch { /* storage may be unavailable */ } }
  async function fetchHistory(id?: string | null, signal?: AbortSignal): Promise<RecentHistory> {
    const response = await fetch('/api/ai-chat/history' + (id ? `?sessionId=${encodeURIComponent(id)}` : ''), { cache: 'no-store', signal });
    if (response.status === 404 && id) return fetchHistory(null, signal);
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : '无法加载会话');
    return body as RecentHistory;
  }
  async function loadHistory(id?: string | null) {
    const next = await fetchHistory(id);
    setHistory(next); rememberSession(next.session?.id ?? null);
    return next;
  }
  useEffect(() => {
    const controller = new AbortController();
    const id = selectedSession();
    fetch('/api/ai-chat/history' + (id ? `?sessionId=${encodeURIComponent(id)}` : ''), { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (response.status === 404 && id) {
          const fallback = await fetch('/api/ai-chat/history', { cache: 'no-store', signal: controller.signal });
          if (!fallback.ok) throw new Error('无法加载会话');
          return await fallback.json() as RecentHistory;
        }
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : '无法加载会话');
        return body as RecentHistory;
      }).then(next => { setHistory(next); rememberSession(next.session?.id ?? null); }).catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '无法加载会话');
      });
    return () => controller.abort();
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [history, busy]);

  async function createOrGetSession() {
    if (history?.session) return history.session;
    const response = await fetch('/api/ai-chat/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || '无法创建会话');
    const session = { id: body.id as string, title: body.title as string };
    setHistory(previous => previous ? { ...previous, session } : previous);
    rememberSession(session.id);
    return session;
  }
  async function send() {
    if (!draft.trim() || busyRef.current || !history) return;
    busyRef.current = true; setBusy('sending'); setError('');
    try {
      const session = await createOrGetSession();
      const text = draft;
      if (!pendingRequests.current[session.id] || pendingRequests.current[session.id].text !== text)
        pendingRequests.current[session.id] = { id: crypto.randomUUID(), text };
      const response = await fetch(`/api/ai-chat/sessions/${session.id}/turns`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: pendingRequests.current[session.id].id, text }),
      });
      const body = await response.json();
      if (!response.ok) {
        // 已确定生成失败时可用新的请求编号重试；网络不确定时沿用编号，避免重复生成。
        if (body.status === 'failed') delete pendingRequests.current[session.id];
        await loadHistory(session.id).catch(() => {});
        throw new Error(body.message || '发送失败，请稍后重试');
      }
      delete pendingRequests.current[session.id];
      setDraft('');
      delete drafts.current[session.id];
      await loadHistory(session.id).catch(() => { throw new Error('消息已发送，但历史刷新失败，请重新打开聊天窗口。'); });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '发送失败，请稍后重试'); }
    finally { busyRef.current = false; setBusy(null); }
  }
  async function upload(file: File) {
    if (busyRef.current || !history) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ATTACHMENT_EXTENSIONS.some(allowed => allowed === extension) || !file.size || file.size > MAX_ATTACHMENT_BYTES) {
      setError('请选择支持的非空文件，大小不超过 5 MB。'); return;
    }
    busyRef.current = true; setBusy('uploading'); setError('');
    try {
      const session = await createOrGetSession();
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`/api/ai-chat/sessions/${session.id}/attachments`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '附件上传失败');
      await loadHistory(session.id).catch(() => { throw new Error('附件已上传，但历史刷新失败，请重新打开聊天窗口。'); });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '附件上传失败，请重新选择文件'); }
    finally { busyRef.current = false; setBusy(null); }
  }
  async function selectSession(id: string) {
    const next = await fetchHistory(id);
    if (next.session?.id !== id) throw new Error('会话不存在或已删除，请刷新列表');
    drafts.current[history?.session?.id ?? 'new'] = draft;
    setDraft(drafts.current[id] ?? '');
    setHistory(next); rememberSession(id); setManaging(false); setError('');
  }
  async function sessionDeleted(id: string) {
    delete drafts.current[id]; delete pendingRequests.current[id];
    if (history?.session?.id === id) {
      const next = await loadHistory();
      setDraft(drafts.current[next.session?.id ?? 'new'] ?? '');
    }
  }
  return <Paper component="section" role="dialog" aria-modal="false" aria-labelledby="ai-chat-title"
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}
    elevation={12} sx={{
      position: 'fixed', zIndex: (theme) => theme.zIndex.modal + 1,
      right: { xs: 12, sm: 24 }, bottom: { xs: 12, sm: 24 },
      width: { xs: 'calc(100vw - 24px)', sm: 400 },
      height: { xs: 'min(640px, calc(100dvh - 24px))', sm: 'min(640px, calc(100dvh - 48px))' },
      display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 4,
    }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"
      sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
          <AutoAwesomeRoundedIcon fontSize="small" />
        </Box>
        <Box><Typography id="ai-chat-title" variant="subtitle1" fontWeight={700}>AI 助手</Typography>
          <Typography variant="body2" color="text.secondary">供应链工作台</Typography></Box>
      </Stack>
      <Stack direction="row" alignItems="center"><Button size="small" onClick={() => setManaging(true)} disabled={Boolean(busy) || !history}>会话</Button>
      <IconButton aria-label="关闭 AI 助手" onClick={onClose} autoFocus><CloseRoundedIcon /></IconButton></Stack>
    </Stack>
    {managing ? <SessionManager activeId={history?.session?.id ?? null} onSelect={selectSession} onDeleted={sessionDeleted} onClose={() => setManaging(false)} /> : <>
    <Box aria-live="polite" sx={{ flex: 1, overflowY: 'auto', p: 2.5, bgcolor: 'background.default' }}>
      {!history && error ? null : !history ?
        <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={24} aria-label="加载会话" /></Stack> :
        !history.session || history.messages.length === 0 ?
          <Stack spacing={1.5} alignItems="center" justifyContent="center" sx={{ height: '100%', textAlign: 'center' }}>
            {history.session && <Typography variant="body2" color="text.secondary">当前会话：{history.session.title}</Typography>}
            <ChatBubbleOutlineRoundedIcon color="primary" sx={{ fontSize: 38 }} />
            <Typography variant="h6">你好，有什么可以帮你？</Typography>
            <Typography variant="body2" color="text.secondary">发送消息开始对话，或先上传附件。</Typography>
          </Stack> :
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">当前会话：{history.session.title}</Typography>
            <MessageList messages={history.messages} hasMore={history.hasMore} sessionId={history.session.id} />
          </Stack>}
      {busy && <Typography variant="caption" color="text.secondary">{busy === 'sending' ? '正在等待 AI 回复…' : '正在上传附件…'}</Typography>}
      <div ref={bottom} />
    </Box>
    {error && <Alert severity="error" sx={{ mx: 1.5, my: 0.5 }}>{error}</Alert>}
    <ChatInput text={draft} onText={setDraft} onSend={send} onFile={upload} busy={Boolean(busy)} disabled={!history} />
    </> }
  </Paper>;
}
