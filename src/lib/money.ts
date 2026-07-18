export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
export const numberValue = (value: string) => Math.max(0, Number(value) || 0)
