import { Editor } from './components/Editor'
import { UploadScreen } from './components/UploadScreen'
import { useEditor } from './store'

export default function App() {
  const hasSession = useEditor((s) => s.session !== null)
  return hasSession ? <Editor /> : <UploadScreen />
}
