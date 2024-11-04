### Test data 
For testing the pipeline of data from the backend to front, we have the following files.

From the dataframe_to_json notebook:

### `test_liveobs.json` 
This has example observation data for different locations. There are missing sensors, locations to practice edge cases and handling exceptions/errors. This is what the data looks like in table form.

| Location   | PM2.5 | Ozone | Temperature | NO  | NOx |
|------------|-------|-------|-------------|-----|-----|
| Roosevelt  | 5.0   | 46.0  | 16.5        |     |     |
| Vernal     | 2.5   | 42.0  |             |     | 4.3 |
| Horsepool  |       |       | 18.0        | 3.0 | 4.0 |

###  `test_wind_ts.json`
This has 96 time stamps of wind speeds that are tabulated as below. The wind speed is in m/s.

| Date Time           | Wind Speed (m/s) |
|---------------------|------------------|
| 2021-01-01 00:00:00 | 0.882026         |
| 2021-01-01 00:30:00 | 0.000000         |
| 2021-01-01 01:00:00 | 1.084653         |
| 2021-01-01 01:30:00 | 1.715730         |
| 2021-01-01 02:00:00 | 2.083779         |
| ...                 | ...              |

### Future
* Clyfar output ozone level (time series forecast)
* Clyfar possibility distributions (bar charts of uncertainty)