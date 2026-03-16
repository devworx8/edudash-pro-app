export interface TeacherQuickAction {
  title: string;
  icon: string;
  color: string;
  path: string;
  onPress: () => void;
  disabled: boolean;
  category: string;
  id: string;
}
