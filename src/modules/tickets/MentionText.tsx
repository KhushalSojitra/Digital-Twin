import { Fragment } from 'react'
import { Box } from '@mui/material'
import { splitMentions } from './mentions'

/** Plain comment text with `@Name` mentions highlighted. */
export default function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((part, index) =>
        part.mention ? (
          <Box key={index} component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
            {part.text}
          </Box>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}
