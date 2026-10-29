'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Checkbox, Chip, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { errorMessage } from '@/lib/auth-contract';

type Row = Record<string, string | number | boolean | null>;
type Field = { key: string; label: string; type?: string; options?: string[] };
const userFields: Field[] = [{key:'name',label:'姓名'},{key:'email',label:'邮箱',type:'email'},{key:'role',label:'岗位',options:['Member','Manager','Analyst']},{key:'status',label:'状态',options:['active','inactive']}];
const companyFields: Field[] = [{key:'companyCode',label:'公司编码'},{key:'companyName',label:'名称'},{key:'level',label:'等级',type:'number'},{key:'country',label:'国家'},{key:'city',label:'城市'},{key:'foundedYear',label:'成立年份',type:'number'},{key:'annualRevenue',label:'年营收',type:'number'},{key:'employees',label:'员工数量',type:'number'}];

export default function ManagementTable({ kind, isAdmin }: { kind: 'users'|'companies'; isAdmin: boolean }) {
  const router = useRouter();
  const company = kind === 'companies';
  const [rows,setRows] = useState<Row[]>([]);
  const [total,setTotal] = useState(0);
  const [search,setSearch] = useState('');
  const [filters,setFilters] = useState<string[]>([]);
  const [page,setPage] = useState(0);
  const [size,setSize] = useState(10);
  const [revision,setRevision] = useState(0);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const lock = useRef(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [selected,setSelected] = useState<string[]>([]);
  const [expanded,setExpanded] = useState<string[]>([]);
  const [form,setForm] = useState<Record<string,string>|null>(null);
  const [editId,setEditId] = useState<string|null>(null);
  const [deleting,setDeleting] = useState<string[]|null>(null);
  const idOf = (r: Row) => String(company ? r.companyCode : r.id);
  const permitted = company || isAdmin;
  const options = company ? Array.from({length:100},(_,i)=>String(i+1)) : ['Member','Manager','Analyst'];
  // AbortController与延迟查询防止旧搜索结果覆盖新结果；分页/筛选变化清空选择。
  useEffect(() => {
    if (!permitted) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      const query = new URLSearchParams({search,page:String(page+1),pageSize:String(size)});
      if(filters.length) query.set(company?'levels':'roles',filters.join(','));
      try {
        const response = await fetch('/api/manage/'+kind+'?'+query, {signal:controller.signal,cache:'no-store'});
        const data = await response.json();
        if(response.status===401) { router.replace('/login'); return; }
        if(!response.ok) throw new Error(errorMessage(data,'读取失败'));
        if(!controller.signal.aborted) { setRows(data.items); setTotal(data.total); }
      } catch(e) { if(!controller.signal.aborted) {setRows([]);setError(e instanceof Error?e.message:'读取失败');} }
      finally {if(!controller.signal.aborted)setLoading(false);}
    },250);
    return () => {clearTimeout(timer);controller.abort();};
  },[kind,company,search,filters,page,size,revision,permitted,router]);

  async function mutate(path: string, method: string, body: unknown) {
    if(lock.current) return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      const response = await fetch('/api/manage/'+kind+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data = await response.json();
      if(response.status===401) {router.replace('/login');return;}
      if(!response.ok) throw new Error(errorMessage(data,'保存失败'));
      setForm(null);setDeleting(null);setSelected([]);setMessage('操作成功，数据已保存');
      setPage(0);setRevision(v=>v+1);
    } catch(e) {setError(e instanceof Error?e.message:'操作失败');}
    finally {lock.current=false;setBusy(false);}
  }
  function open(row?: Row) {
    setError('');setEditId(row?idOf(row):null);
    setForm(row ? Object.fromEntries(Object.entries(row).map(([k,v])=>[k,String(v??'')])) :
      company ? {companyCode:'',companyName:'',level:'1',country:'',city:'',foundedYear:'',annualRevenue:'',employees:''} :
      {name:'',email:'',role:'Member',status:'active',password:''});
  }
  const fields = company ? companyFields : [...userFields,...(!editId?[{key:'password',label:'初始密码（15–128个字符）',type:'password'}]:[])];
  if(!permitted) return <Alert severity="info">用户管理仅对管理员开放。</Alert>;
  return <Stack spacing={3}>
    <Box><Typography variant="h4">{company?'Company · 公司':'User · 用户'}</Typography>
      <Typography color="text.secondary">{company?'查看供应链公司资料与人均年营收':'维护用户资料、岗位与账号状态'}</Typography></Box>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    <Stack direction={{xs:'column',sm:'row'}} spacing={2}>
      <TextField label={company?'按公司名搜索':'按姓名搜索'} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);setSelected([]);}}/>
      <TextField select label={company?'等级（多选）':'岗位（多选）'} value={filters} slotProps={{select:{multiple:true}}} sx={{minWidth:200}} onChange={e=>{setFilters(typeof e.target.value==='string'?e.target.value.split(','):e.target.value);setPage(0);setSelected([]);}}>
        {options.map(option=><MenuItem key={option} value={option}>{option}</MenuItem>)}
      </TextField>
      <Button onClick={()=>{setSearch('');setFilters([]);setPage(0);setSelected([]);}}>清除筛选</Button>
      {isAdmin && <Button variant="contained" disabled={busy} onClick={()=>open()}>添加{company?'公司':'用户'}</Button>}
      {!company && isAdmin && <Button color="error" disabled={!selected.length||busy} onClick={()=>setDeleting(selected)}>删除已选（{selected.length}）</Button>}
    </Stack>
    {company && <Typography variant="body2">人均年营收 = 年营收 ÷ 员工数。演示色阶：低于100 / 100至不足500 / 500及以上（原始单位/人）。不是利润或风险评级；成立年份不代表开始供应日期。</Typography>}
    <Paper variant="outlined">
      {loading && <LinearProgress/>}
      <TableContainer><Table aria-label={company?'公司表格':'用户表格'}>
        <TableHead><TableRow>
          <TableCell>{company?'详情':<Checkbox inputProps={{'aria-label':'选择当前页普通用户'}} checked={rows.some(r=>!r.isAdmin)&&rows.filter(r=>!r.isAdmin).every(r=>selected.includes(idOf(r)))} disabled={loading||busy} onChange={e=>setSelected(e.target.checked?rows.filter(r=>!r.isAdmin).map(idOf):[])}/>}</TableCell>
          {(company?['名称','等级','国家','人均年营收']:['姓名','邮箱','岗位','状态']).map(label=><TableCell key={label}>{label}</TableCell>)}<TableCell>操作</TableCell>
        </TableRow></TableHead>
        <TableBody>{rows.map(row=>{const id=idOf(row);const ratio=row.revenuePerEmployee;return <Fragment key={id}>
          <TableRow hover>
            <TableCell>{company?<Button aria-label={'展开 '+row.companyName} aria-expanded={expanded.includes(id)} onClick={()=>setExpanded(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}>{expanded.includes(id)?'收起':'展开'}</Button>:<Checkbox inputProps={{'aria-label':'选择 '+row.email}} checked={selected.includes(id)} disabled={!!row.isAdmin||busy||loading} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>}</TableCell>
            {(company?['companyName','level','country']:['name','email','role']).map(key=><TableCell key={key}>{String(row[key]||'未设置')}</TableCell>)}
            <TableCell>{company?<Chip label={typeof ratio==='number'?ratio.toLocaleString(undefined,{maximumFractionDigits:2}):'不可计算'} sx={{bgcolor:typeof ratio!=='number'?'action.disabledBackground':ratio<100?'#fff3e0':ratio<500?'#e3f2fd':'#e8f5e9'}}/>:<Chip label={row.status==='active'?'启用':'停用'} color={row.status==='active'?'success':'default'}/>}</TableCell>
            <TableCell>{isAdmin && (company||!row.isAdmin)?<Stack direction="row"><Button disabled={busy} onClick={()=>open(row)}>编辑</Button><Button color="error" disabled={busy} onClick={()=>setDeleting([id])}>删除</Button></Stack>:<Typography variant="caption">{row.isAdmin?'管理员受保护':'只读'}</Typography>}</TableCell>
          </TableRow>
          {company && <TableRow><TableCell colSpan={6} sx={{py:0}}><Collapse in={expanded.includes(id)} unmountOnExit><Stack spacing={1} sx={{p:2}}>{companyFields.slice(4).map(f=><Typography key={f.key}>{f.label}：{String(row[f.key])}</Typography>)}</Stack></Collapse></TableCell></TableRow>}
        </Fragment>;})}
        {!loading&&!rows.length&&<TableRow><TableCell colSpan={6}>没有符合条件的数据</TableCell></TableRow>}
        </TableBody></Table></TableContainer>
      <TablePagination component="div" count={total} page={page} rowsPerPage={size} rowsPerPageOptions={[10,25,50]} onPageChange={(_,p)=>{setPage(p);setSelected([]);}} onRowsPerPageChange={e=>{setSize(Number(e.target.value));setPage(0);setSelected([]);}}/>
    </Paper>
    <Dialog open={!!form} onClose={()=>{if(!busy)setForm(null);}} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={e=>{e.preventDefault();if(!form)return;const body:Record<string,string|number>={};for(const field of fields){if(editId&&field.key==='companyCode')continue;body[field.key]=field.type==='number'?Number(form[field.key]):form[field.key];}void mutate(editId?'/'+encodeURIComponent(editId):'',editId?'PATCH':'POST',body);}}>
        <DialogTitle>{editId?'编辑':'添加'}{company?'公司':'用户'}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{pt:1}}>
          {error && <Alert severity="error">{error}</Alert>}
          {fields.map(f=><TextField key={f.key} label={f.label} type={f.type??'text'} required select={!!f.options} value={form?.[f.key]??''} disabled={busy||!!editId&&f.key==='companyCode'} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))} slotProps={{htmlInput:{min:f.key==='employees'||f.key==='annualRevenue'?0:1,step:f.key==='annualRevenue'?'0.01':1,minLength:f.key==='password'?15:undefined,maxLength:f.key==='password'?128:undefined}}}>{f.options?.map(v=><MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField>)}
        </Stack></DialogContent>
        <DialogActions><Button disabled={busy} onClick={()=>setForm(null)}>取消</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'保存中…':'保存'}</Button></DialogActions>
      </Box>
    </Dialog>
    <Dialog open={!!deleting} onClose={()=>{if(!busy)setDeleting(null);}}>
      <DialogTitle>确认删除 {deleting?.length} 条记录？</DialogTitle>
      <DialogContent><Typography>删除后无法从页面恢复。</Typography>{error&&<Alert severity="error">{error}</Alert>}</DialogContent>
      <DialogActions><Button disabled={busy} onClick={()=>setDeleting(null)}>取消</Button><Button color="error" disabled={busy} onClick={()=>{if(deleting)void mutate(company?'/'+encodeURIComponent(deleting[0]):'/bulk-delete',company?'DELETE':'POST',company?{}:{ids:deleting});}}>确认删除</Button></DialogActions>
    </Dialog>
  </Stack>;
}
