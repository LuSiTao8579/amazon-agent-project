import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, List, ListItem, ListItemButton, ListItemText, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

type Session = { id: string; title: string; updatedAt: string | null };
type Props = { activeId: string | null; onSelect: (id: string) => Promise<void>; onDeleted: (id: string) => Promise<void>; onClose: () => void };

/** 列表分页读取；删除前确认，后端执行软删除。 */
export default function SessionManager({ activeId, onSelect, onDeleted, onClose }: Props) {
  const [items, setItems] = useState<Session[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [toDelete, setToDelete] = useState<Session | null>(null);

  const load = useCallback(async (nextPage: number, signal?: AbortSignal) => {
    const response = await fetch(`/api/ai-chat/sessions?page=${nextPage}`, { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || '无法加载会话列表');
    setItems(previous => nextPage === 1 ? body.items : [...previous, ...body.items.filter((item: Session) => !previous.some(p => p.id === item.id))]);
    setPage(nextPage); setHasMore(body.hasMore);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai-chat/sessions?page=1', { cache: 'no-store', signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.message || '无法加载会话列表'); return body; })
      .then(body => { setItems(body.items); setPage(1); setHasMore(body.hasMore); setLoading(false); })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : '无法加载会话列表'); setLoading(false); } });
    return () => controller.abort();
  }, []);
  async function run(action: () => Promise<void>) {
    if (working) return;
    setWorking(true); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setWorking(false); }
  }
  async function create() {
    await run(async () => {
      const response = await fetch('/api/ai-chat/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(title.trim() ? { title: title.trim() } : {}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '创建会话失败');
      setCreating(false); setTitle('');
      await onSelect(body.id);
    });
  }
  async function remove(session: Session) {
    await run(async () => {
      const response = await fetch(`/api/ai-chat/sessions/${session.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || '删除会话失败');
      setToDelete(null);
      await onDeleted(session.id);
      await load(1);
    });
  }
  return <Stack sx={{ flex: 1, minHeight: 0 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
      <Typography variant="subtitle1" fontWeight={700}>会话列表</Typography>
      <Stack direction="row" spacing={1}><Button onClick={() => setCreating(true)} disabled={working}>新建会话</Button>
        <Button onClick={onClose} disabled={working}>返回聊天</Button></Stack>
    </Stack>
    {error && <Alert severity="error" sx={{ mx: 2 }}>{error}</Alert>}
    <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
      {loading ? <CircularProgress aria-label="加载会话列表" size={24} /> : items.length === 0 ?
        <Typography color="text.secondary" sx={{ p: 2 }}>暂无会话，点击新建会话开始。</Typography> :
        <List>{items.map(session => <ListItem key={session.id} disablePadding secondaryAction={
          <IconButton edge="end" aria-label={`删除会话 ${session.title}`} disabled={working} onClick={() => setToDelete(session)}><DeleteOutlineIcon /></IconButton>}>
          <ListItemButton selected={session.id === activeId} disabled={working} onClick={() => void run(() => onSelect(session.id))}>
            <ListItemText primary={session.title} secondary={session.id === activeId ? '当前会话' : undefined} sx={{ overflowWrap: 'anywhere' }} />
          </ListItemButton>
        </ListItem>)}</List>}
      {hasMore && <Button onClick={() => void run(() => load(page + 1))} disabled={working}>加载更多</Button>}
    </Box>
    <Dialog onKeyDown={event => event.stopPropagation()} open={creating} onClose={() => { if (!working) setCreating(false); }} fullWidth maxWidth="xs">
      <DialogTitle>新建会话</DialogTitle><DialogContent>
        <DialogContentText>为会话取一个名称，留空时使用“新会话”。</DialogContentText>
        <TextField autoFocus fullWidth margin="dense" label="会话名称" value={title} onChange={e => setTitle(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }} disabled={working} />
        {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      </DialogContent><DialogActions><Button onClick={() => setCreating(false)} disabled={working}>取消</Button>
        <Button onClick={() => void create()} disabled={working}>创建</Button></DialogActions>
    </Dialog>
    <Dialog onKeyDown={event => event.stopPropagation()} open={Boolean(toDelete)} onClose={() => { if (!working) setToDelete(null); }} fullWidth maxWidth="xs">
      <DialogTitle>删除会话？</DialogTitle><DialogContent><DialogContentText>
        “{toDelete?.title}”将从会话列表中隐藏，其消息和附件也无法在正常界面访问。记录暂时保留在数据库中，当前没有自助恢复入口。
      </DialogContentText>{error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setToDelete(null)} disabled={working}>取消</Button>
        <Button color="error" onClick={() => { if (toDelete) void remove(toDelete); }} disabled={working}>确认删除</Button></DialogActions>
    </Dialog>
  </Stack>;
}
