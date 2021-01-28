export const floorWithPrecision = (number, precision) => {
  let [base, decimal] = `${Number(number)}`.split('.');
  if (!decimal) return Number(number);

  decimal = decimal.slice(0, precision);
  return Number(`${base}.${decimal}`);
};
