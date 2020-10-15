/**
* Calculates prices based on inflation
* @param {A2:A10} original_date [optional] The date or range of dates corresponding to the original_price(s). Defaults to today.
* original_date and target_date cannot both be ranges.
* @param {B2:D10} original_price The original price or range of prices
* @param {TODAY()} target_date [optional] The date or range of dates to convert the original_price to. Defaults to today.
* original_date and target_date cannot both be ranges.
* @param {'inflation data'!$A$2:B} inflation_data The range of cells containing inflation data, where
* the first column is dates, and the second column is inflation indices for those given dates
* @param {0.02} predicted_annual_inflation [optional] Predicted inflation to use in case the original. Defaults to 0.02.
* or target dates fall outside the range covered by the inflation table (optional).
* @return The price(s) adjusted for inflation to the target_date(s)
* @customfunction
*/
function adjust_prices_for_inflation(original_date, original_price, target_date, inflation_data, predicted_annual_inflation) {
  original_date = original_date || new Date();
  target_date = target_date || new Date();
  predicted_annual_inflation = predicted_annual_inflation || 0.02;
  if (original_price === "") {
    return "";
  }
  if (original_date.map) {
    if (target_date.map) {
      throw("original_date and target_date can't both be ranges");
    }
    if (original_price.map) {
      var values = new Array();
      for (var i = 0; i < original_date.length; ++i) {
        if (original_date[i] == "") {
          break;
        }
        var subvalues = new Array();
        for (var j = 0; j < original_price[i].length; ++j) {
          subvalues.push(adjust_prices_for_inflation(new Date(original_date[i]), original_price[i][j], target_date, inflation_data));
        }
        values.push(subvalues);
      }
      return values;
    }
    return original_date.map(
      function(x) {
        return adjust_prices_for_inflation(x, original_price, target_date, inflation_data);
      }
    );
  }
  if (target_date.map) {
    if (original_price.map) {
      var values = new Array();
      for (var i = 0; i < target_date.length; ++i) {
        if (target_date[i] == "") {
          break;
        }
        var subvalues = new Array();
        for (var j = 0; j < original_price[i].length; ++j) {
          subvalues.push(adjust_prices_for_inflation(new Date(original_date), original_price[i][j], target_date[i], inflation_data));
        }
        values.push(subvalues);
      }
      return values;
    }
    return target_date.map(
      function(x) {
        return adjust_prices_for_inflation(original_date, original_price, x, inflation_data);
      }
    );
  }
  if (original_price.map) {
    return original_price.map(
      function(x) {
        return adjust_prices_for_inflation(original_date, x, target_date, inflation_data);
      }
    );
  }
  var original_inflation_index = get_inflation_index(original_date, inflation_data, predicted_annual_inflation);
  var target_inflation_index = get_inflation_index(target_date, inflation_data, predicted_annual_inflation);
  return original_price * target_inflation_index / original_inflation_index;
}

/**
* Retrieves the inflation index or indices for a given date by extrapolating from known data
* @param {A2:A10} target_date [optional] The date or range of dates to retrieve the index for. Defaults to today.
* @param {'inflation data'!$A$2:B} inflation_data The range of cells containing inflation data, where
* the first column is dates, and the second column is inflation indices for those given dates
* @param {0.02} predicted_annual_inflation [optional] Predicted inflation to use in case the original. Defaults to 0.02
* or target dates fall outside the range covered by the inflation table
* @return The inflation index or indices for the given target_date(s)
* @customfunction
*/
function get_inflation_index(target_date, inflation_data, predicted_annual_inflation) {
  if (typeof inflation_data != "object" || inflation_data.length == undefined || inflation_data[0].length == 1) {
    throw("Invalid range");
  }
  target_date = target_date || new Date();
  predicted_annual_inflation = predicted_annual_inflation || 0.02;

  if (target_date.map) {
    return target_date.map(
      function(x) { return get_inflation_index(x, inflation_data, predicted_annual_inflation); }
    );
  }

  var previous_date_index = -1;
  var next_date_index = -1;
  for (var i = 0; i < inflation_data.length; ++i) {
    if (inflation_data[i][0] == "") {
      previous_date_index = i - 1;
      break;
    }
    if (target_date < inflation_data[i][0]) {
      break;
    }
    previous_date_index = i;
  }
  if (inflation_data[previous_date_index + 1][0] != "") {
    next_date_index = previous_date_index + 1
  }
  
  if (previous_date_index < 0 && next_date_index < 0) {
    throw("Invalid range")
  }
  
  var previous_date = target_date;
  var next_date = target_date;
  var previous_inflation_index;
  var next_inflation_index;
  if (previous_date_index > -1) {
    previous_date = inflation_data[previous_date_index][0]
    previous_inflation_index = inflation_data[previous_date_index][1]
  }
  if (next_date_index > -1) {
    next_date = inflation_data[next_date_index][0]
    next_inflation_index = inflation_data[next_date_index][1]
  }
  if (next_inflation_index == undefined) {
    var time_difference = next_date - previous_date;
    var day_difference = Math.ceil(time_difference / (1000 * 3600 * 24)); 
    return previous_inflation_index * Math.pow(1 + predicted_annual_inflation, day_difference / 365.25);
  }
  if (previous_inflation_index != undefined) {
    var scalar = (target_date - previous_date) / (next_date - previous_date);
    return previous_inflation_index + (next_inflation_index - previous_inflation_index) * scalar;
  }
  var time_difference = next_date - previous_date;
  var day_difference = Math.ceil(time_difference / (1000 * 3600 * 24)); 
  return next_inflation_index / Math.pow(1 + predicted_annual_inflation, day_difference / 365.25);
}

/**
* Retrieves inflation series data from FRED (Federal Reserve Economic Data)
* @param {'6d92...cef6'} api_key Your FRED API key that allows access to their web service
* @param {'CPIAUCSL'} series [optional] The FRED data series to use. Defaults to 'CPIAUCSL'
* @return Dates in one column, and their corresponding index values in the second column
* @customfunction
*/
function get_fred_series_data(api_key, series) {
  if (!/^[a-fA-F0-9]+$/.test(api_key)) {
    throw("Invalid api_key");
  }
  series = series || 'CPIAUCSL';
  if (!/^[a-zA-Z0-9]+$/.test(series)) {
    throw("Invalid series");
  }
  var url = 'https://api.stlouisfed.org/fred/series/observations?api_key=' + api_key
  + '&series_id=' + series + '&frequency=m&file_type=json';
  
  var response = UrlFetchApp.fetch(url, {'muteHttpExceptions': true});
  
  var json = response.getContentText();
  var observations = JSON.parse(json).observations;
  
  var return_data = [];
  for (var i = 0; i < observations.length; ++i) {
    var entry = [];
    var date_parts = observations[i].date.split('-');
    entry.push(new Date(date_parts[0], date_parts[1] - 1, date_parts[2]), Number(observations[i].value));
    return_data.push(entry);
  }
  
  return return_data;
}
