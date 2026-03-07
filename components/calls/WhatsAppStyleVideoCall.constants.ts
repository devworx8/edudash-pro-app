import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const LOCAL_VIDEO_WIDTH = 120;
const LOCAL_VIDEO_HEIGHT = 160;
const MINIMIZED_SIZE = 100;

export {
  LOCAL_VIDEO_HEIGHT,
  LOCAL_VIDEO_WIDTH,
  MINIMIZED_SIZE,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
};
