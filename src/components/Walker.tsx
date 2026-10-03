import React from 'react';
import { walkerClass, walkerSvg, WalkerMood } from './walkerSvg';

const Walker: React.FC<{ size?: number; mood?: WalkerMood; west?: boolean; style?: React.CSSProperties }> = ({ size = 28, mood = 'walking', west = false, style }) => (
  <div className={walkerClass(mood, west)} style={style} dangerouslySetInnerHTML={{ __html: walkerSvg(size) }} />
);

export default Walker;
