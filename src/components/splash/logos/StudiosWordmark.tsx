import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { studiosPaths } from "./svgPaths";

type Props = {
  width: number;
  height: number;
};

export function StudiosWordmark({ width, height }: Props) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 1011.35 139.902"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      <Defs>
        <LinearGradient
          id="studiosTextGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
        >
          <Stop offset="0%" stopColor="#e2e8f0" />
          <Stop offset="50%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#cbd5e1" />
        </LinearGradient>
      </Defs>
      <Path d={studiosPaths.p1f753a00} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p30873280} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p1eaf6200} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p57bb80} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p1c040af0} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p35643100} fill="url(#studiosTextGradient)" />
      <Path d={studiosPaths.p23985d00} fill="url(#studiosTextGradient)" />
    </Svg>
  );
}
