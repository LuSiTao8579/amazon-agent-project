// 比较原始业务值，格式化到两位小数只影响标签，不改变分档。
export function revenuePerEmployeeDisplay(value: number | null) {
  if (value === null) return { label: '不可计算', bgcolor: 'action.disabledBackground' };
  const bgcolor = value < 100 ? '#fff3e0' : value < 500 ? '#e3f2fd' : '#e8f5e9';
  return { label: value.toLocaleString(undefined, { maximumFractionDigits: 2 }), bgcolor };
}
