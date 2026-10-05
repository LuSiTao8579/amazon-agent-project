'use client';

import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#155e75' },
    background: { default: '#f4f7fa' },
  },
  typography: {
    fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  shape: { borderRadius: 12 },
});

export default theme;
