# How to View Server Logs

## Quick Start

1. **Start the server in development mode:**
   ```bash
   cd ShadcnExplore
   npm run dev
   ```

2. **Logs will appear in the terminal** where you ran the command.

## Log Tags

The logs use prefixes to help you filter:

- `[SIGNAL]` - Signal generation for individual companies
- `[SIGNAL-CALC]` - Signal calculation batch process
- `[EXCEL-FORMULA]` - Excel formula evaluation

## Filtering Logs

### In Terminal (while server is running):

**View only signal logs:**
```bash
# macOS/Linux - if you have the server running in another terminal
# You can pipe the output or use tail with grep
```

**Save logs to a file:**
```bash
npm run dev 2>&1 | tee server.log
```

Then you can search the file:
```bash
grep "\[SIGNAL" server.log
grep "\[EXCEL-FORMULA" server.log
```

### Using grep in real-time:

If you want to monitor logs in real-time while filtering:
```bash
# In one terminal, run the server and pipe to grep
npm run dev 2>&1 | grep -E "\[SIGNAL|\[EXCEL-FORMULA"
```

## What to Look For

When debugging why signals aren't being generated, check for:

1. **Formula availability:**
   - `[SIGNAL-CALC] Found X enabled formula(s)`
   - `[SIGNAL] Total enabled formulas available: X`

2. **Company processing:**
   - `[SIGNAL-CALC] Processing company X/Y: TICKER`
   - `[SIGNAL] Starting signal generation for company: TICKER`

3. **Formula selection:**
   - `[SIGNAL] Found assigned formula: ...`
   - `[SIGNAL] Found X applicable formulas after scope filtering`

4. **Data availability:**
   - `[EXCEL-FORMULA] Retrieved X quarterly data records`
   - `[EXCEL-FORMULA] Available quarters: ...`
   - `[EXCEL-FORMULA] Available metrics: ...`

5. **Evaluation results:**
   - `[EXCEL-FORMULA] Formula evaluation result: ...`
   - `[SIGNAL] ✓ Signal generated: ...`
   - `[SIGNAL] ✗ No signal generated for company ...`

6. **Errors:**
   - `[SIGNAL-CALC] ✗ Failed to evaluate signals for company ...`
   - `[EXCEL-FORMULA] ✗ Error evaluating Excel formula ...`

## Production Logs

If running in production:
```bash
npm start 2>&1 | tee production.log
```

Or if using a process manager like PM2:
```bash
pm2 logs
pm2 logs | grep -E "\[SIGNAL|\[EXCEL-FORMULA"
```
