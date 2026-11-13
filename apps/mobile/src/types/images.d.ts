// Image files imported as modules (Metro gives the asset id; expo-image accepts it as a source).
declare module '*.jpg' {
  const source: number;
  export default source;
}
