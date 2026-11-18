import type { ReactNode } from 'react';
import { Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

type Props = { label: string; columns: string[]; summary: string; children: ReactNode };

export default function ResultTable({ label, columns, summary, children }: Props) {
  return <Stack spacing={1}>
    <Typography variant="body2">{summary}</Typography>
    <TableContainer role="region" aria-label={`${label}滚动区域`} tabIndex={0}
      sx={{ maxHeight: 'min(45dvh, 22rem)', overflow: 'auto' }}>
      <Table size="small" stickyHeader aria-label={label}
        sx={{ minWidth: '26rem', '& thead th': { whiteSpace: 'nowrap' } }}>
        <TableHead><TableRow>{columns.map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  </Stack>;
}
