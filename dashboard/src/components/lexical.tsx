import { LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { Button, Space } from 'antd'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type EditorState,
  FORMAT_TEXT_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  REDO_COMMAND,
  type TextFormatType,
  UNDO_COMMAND,
} from 'lexical'
import { type JSX, useEffect, useRef, useState } from 'react'

import type { LexicalSerializedState } from '@/types'

export interface LexicalRichTextEditorProps {
  value?: LexicalSerializedState | null
  onChange?: (value: LexicalSerializedState | undefined) => void
}

const editorTheme = {
  paragraph: 'lexical-editor-paragraph',
}

type BlockFormatTag = 'paragraph' | 'h1' | 'h2' | 'h3' | 'quote'

const textFormatActions: Array<{
  command: LexicalCommand<TextFormatType>
  payload: TextFormatType
  label: JSX.Element
  title: string
}> = [
  { command: FORMAT_TEXT_COMMAND, payload: 'bold', label: <b>B</b>, title: 'Bold' },
  { command: FORMAT_TEXT_COMMAND, payload: 'italic', label: <i>I</i>, title: 'Italic' },
  { command: FORMAT_TEXT_COMMAND, payload: 'underline', label: <u>U</u>, title: 'Underline' },
]

const blockFormatActions: Array<{ tag: BlockFormatTag; label: string; title: string }> = [
  { tag: 'paragraph', label: '¶ Text', title: 'Paragraph' },
  { tag: 'h1', label: 'H1', title: 'Heading 1' },
  { tag: 'h2', label: 'H2', title: 'Heading 2' },
  { tag: 'h3', label: 'H3', title: 'Heading 3' },
  { tag: 'quote', label: '❝', title: 'Quote' },
]

const applyBlockFormat = (editor: LexicalEditor, tag: BlockFormatTag) => {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) {
      return
    }
    if (tag === 'paragraph') {
      $setBlocksType(selection, () => $createParagraphNode())
      return
    }
    $setBlocksType(selection, () =>
      tag === 'quote' ? $createQuoteNode() : $createHeadingNode(tag),
    )
  })
}

const LexicalEditorToolbar = (): JSX.Element => {
  const [editor] = useLexicalComposerContext()

  const toggleLink = () => {
    const url = prompt('Enter link URL')
    if (url === null) {
      return
    }
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url ? { url } : null)
  }

  return (
    <div className="lexical-editor-toolbar">
      <Space size={4} wrap>
        {textFormatActions.map((action) => (
          <Button
            key={action.title}
            title={action.title}
            size="small"
            onClick={() => editor.dispatchCommand(action.command, action.payload)}
          >
            {action.label}
          </Button>
        ))}
        {blockFormatActions.map((block) => (
          <Button
            key={block.title}
            title={block.title}
            size="small"
            onClick={() => applyBlockFormat(editor, block.tag)}
          >
            {block.label}
          </Button>
        ))}
        <Button title="Link" size="small" onClick={toggleLink}>
          Link
        </Button>
        <Button
          title="Undo"
          size="small"
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          ⟲
        </Button>
        <Button
          title="Redo"
          size="small"
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          ⟳
        </Button>
      </Space>
    </div>
  )
}

export const LexicalRichTextEditor = ({
  value,
  onChange,
}: LexicalRichTextEditorProps): JSX.Element => {
  const [generation, setGeneration] = useState(0)
  const lastEmittedStringRef = useRef<string | undefined>(undefined)

  const valueString = value ? JSON.stringify(value) : ''

  // Re-mount the editor with incoming payload content only when it changed outside this
  // editor (edit form load or form reset) instead of on every local keystroke.
  useEffect(() => {
    if (valueString !== (lastEmittedStringRef.current ?? '')) {
      lastEmittedStringRef.current = valueString
      setGeneration((current) => current + 1)
    }
  }, [valueString])

  const initialConfig = {
    editorState: valueString ? JSON.stringify(value) : null,
    namespace: `payload-refine-editor-${generation}`,
    theme: editorTheme,
    onError: (error: Error) => {
      console.error('Lexical editor error', error)
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode],
  }

  const handleEditorChange = (editorState: EditorState) => {
    const serialized = editorState.toJSON()
    const serializedString = JSON.stringify(serialized)
    if (serializedString === lastEmittedStringRef.current) {
      return
    }
    lastEmittedStringRef.current = serializedString
    onChange?.(serialized as unknown as LexicalSerializedState)
  }

  return (
    <LexicalComposer key={generation} initialConfig={initialConfig}>
      <LexicalEditorToolbar />
      <div className="lexical-editor-wrapper">
        <RichTextPlugin
          contentEditable={<ContentEditable className="lexical-editor-input" />}
          placeholder={
            <div className="lexical-editor-placeholder">Write rich text content here…</div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
        <LinkPlugin />
        <HistoryPlugin />
        <OnChangePlugin onChange={handleEditorChange} ignoreSelectionChange />
      </div>
    </LexicalComposer>
  )
}
