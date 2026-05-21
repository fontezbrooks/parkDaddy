import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { daddyPaths } from "./svgPaths";

type Props = {
  width: number;
  height: number;
};

export function DaddyWordmark({ width, height }: Props) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 1555.26 784.739"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
    >
      <Defs>
        <LinearGradient id="daddyTextGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#e2e8f0" />
          <Stop offset="50%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#cbd5e1" />
        </LinearGradient>
      </Defs>
      <Path d={daddyPaths.p2a97bf00} fill="url(#daddyTextGradient)" />
    </Svg>
  );
}
