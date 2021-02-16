const isAssetFundAvailable = (asset) => {
  return asset && asset.free > 0;
};

export default isAssetFundAvailable;
