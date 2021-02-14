const calculateFromPercentage = (note, percentage) => {
  if (percentage > 0.94) return note;
  return note * percentage;
};

export default calculateFromPercentage;
