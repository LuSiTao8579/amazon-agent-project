'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { errorMessage } from '@/lib/auth-contract';
import LevelChart from './level-chart';
import GrowthChart from './growth-chart';

import DashboardMetrics from './dashboard-metrics';
export type { Dashboard as DashboardData } from '../../../contracts/tool-result.d.ts';
import type { Dashboard as DashboardData } from '../../../contracts/tool-result.d.ts';

export default function Dashboard() {
  const [data,setData] = useState<DashboardData|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const router = useRouter();
  const load = useCallback(async (signal?:AbortSignal) => {
    setLoading(true);setError('');
    try {
      const response = await fetch('/api/manage/dashboard',{cache:'no-store',signal});
      const body = await response.json();
      if(response.status===401){router.replace('/login');return;}
      if(!response.ok) throw new Error(errorMessage(body,'读取数据失败'));
      if(!signal?.aborted)setData(body);
    } catch(e) {if(!signal?.aborted)setError(e instanceof Error?e.message:'读取数据失败');}
    finally {if(!signal?.aborted)setLoading(false);}
  },[router]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),0);return ()=>{clearTimeout(timer);controller.abort();};},[load]);
  return <Stack spacing={3}>
    <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography component="h1" variant="h4">Dashboard</Typography><Typography component="h2" variant="subtitle1" color="text.secondary">数据总览</Typography></Box><Button onClick={()=>void load()} disabled={loading}>刷新数据</Button></Stack>
    <Typography color="text.secondary">基于全部公司资料统计；修改公司后可点击刷新数据。</Typography>
    {error && <Alert severity="error" action={<Button color="inherit" onClick={()=>void load()}>重试</Button>}>{error}</Alert>}
    {loading && <CircularProgress aria-label="加载数据"/>}
    {data && <DashboardMetrics summary={data.summary}/>}
    {data && <LevelChart rows={data.levelDistribution}/>}
    {data && <GrowthChart rows={data.yearlyGrowth}/>}
  </Stack>;
}
