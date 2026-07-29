export const PUBLIC_STORE = {
  url: '',
  anonKey: '',
  table: 'tnva_faces'
};

export const DEVICE = {
  namePrefix: 'TNVA-CLOCK',
  service: 0xff00,
  characteristic: 0xff01,
  profiles: {
    '212x104': { width: 212, height: 104, maxPackageBytes: 4096 },
    '250x122': { width: 250, height: 122, maxPackageBytes: 4096 }
  }
};
