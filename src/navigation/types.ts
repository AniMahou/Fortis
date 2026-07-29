import type {VoxPosition} from '../native/VoxLocation';
import type {WipeReport} from '../storage/panicWipe';

export type RootStackParamList = {
  Splash: undefined;
  Welcome: undefined;
  PrivacyWarning: undefined;
  SetNickname: undefined;
  SetPin: undefined;
  Permissions: undefined;
  SetupComplete: undefined;
  Main: undefined;
  MeshRelay: undefined;
  SosConfirmation: {
    position: VoxPosition;
    sentAt: number;
    peerCount: number;
  };
  ReportDanger: undefined;
  WipeComplete: {report: WipeReport};
  Settings: undefined;
  MediaArchive: undefined;
  Misinformation: undefined;
  ChatThread: {name: string};
};

export type MainTabParamList = {
  Chat: undefined;
  Feed: undefined;
  Map: undefined;
  Safety: undefined;
};
