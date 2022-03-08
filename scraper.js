import fs from 'fs';
import axios from 'axios';
import momentTz from 'moment-timezone';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import dot from 'dotenv';
import htmlToPage from './htmlToImage.js';

dot.config();
const OAuth2 = google.auth.OAuth2;

/**
 * Flux metabase credentials
 */
const userInfo = {
  username: process.env.USERNAME,
  password: process.env.PASSWORD,
};

/**
 * The API request headers
 */
const options = {
  headers: { 'Content-Type': 'application/json' },
};

/**
 * warehouseName: Change accordingly or add the new one
 * Note: Please make sure that the name is the same with the table name
 */
const warehouses = [
  { warehouseName: 'pancoran' },
  { warehouseName: 'bandung' },
  { warehouseName: 'palembang' },
  { warehouseName: 'medan' },
  { warehouseName: 'pluit' },
];

// Prevents new properties from being added to it
Object.freeze(warehouses);

/**
 * Generate the Metabase session to use the Metabase's APIs
 */
const {
  data: { id: metabaseSessionToken },
} = await axios.post(`${process.env.BASE_URL}/api/session`, userInfo, options);

warehouses.map(async (warehouse) => {
  const { warehouseName } = warehouse;
  const {
    data: {
      data: {
        rows,
        results_metadata: { columns },
      },
    },
  } = await axios.post(
    `${process.env.BASE_URL}/api/dataset`,
    {
      database: 2,
      native: {
        query: ``, // put your query here
        'template-tags': {},
      },
      parameters: {},
      type: 'native',
    },
    {
      headers: {
        ...options.headers,
        'X-Metabase-Session': metabaseSessionToken,
      },
    }
  );

  const tableHeadData = getTableHeadData(columns);
  const tableData = getTableData(rows);

  const date = new Date();
  const month = momentTz.tz(date, 'Asia/Jakarta').format('MMMM');
  const year = momentTz.tz(date, 'Asia/Jakarta').format('YYYY');
  const currentTime = momentTz.tz(date, 'Asia/Jakarta').format('LLLL');
  const timestamp = momentTz.tz(date, 'Asia/Jakarta').valueOf();
  const tokoCabang = convertFirstLetterToUpperCase(warehouseName);

  const dataTable = {
    TABLE_HEAD: tableHeadData,
    TABLE_DATA: tableData,
    MONTH: month,
    YEAR: year,
    GENERATED_AT: currentTime,
    TOKO_CABANG: tokoCabang,
  };

  // table is the name of html file (table.html)
  const htmlTemplate = await loadHtmlTemplate('table');

  const htmlContent = await buildHtmlContent(htmlTemplate, dataTable);

  // screenshot procces using puppeter library
  const imageBuffer = await htmlToPage(htmlContent);

  /**
   * Write/save the file into parent directory of current folder.
   * Format in .PNG file
   */
  fs.writeFileSync(`./image/${warehouseName}_${timestamp}.png`, imageBuffer);

  // const mailOptions = {
  //   from: process.env.EMAIL,
  //   cc: 'ANOTHER_EMAIL', // add a CC email
  //   to: 'RECEIVER_EMAIL', // receiver email
  //   subject: 'PUT_SUBJECT_HERE', // add subject of email
  //   text: 'Hi Dear! Good MOrning', // text here
  //   html: htmlContent,
  // };
  // sendEmail(mailOptions);
});

/**
 * Get the data to fill in into <td> content
 * @param {*} rows
 * @returns <tr><td>Example Data</td></tr>
 */
const getTableData = (rows) => {
  return rows
    .map((row) => {
      return `
        <tr>
          ${row
            .map(
              (r) =>
                `<td>${
                  typeof r === 'number'
                    ? `${Math.round(r * 100)}%`
                    : r !== null
                    ? r
                    : '-'
                }</td>`
            )
            .join('')}
        </tr>
      `;
    })
    .join('');
};

/**
 * Get data to fill in into <th> content
 * @param {*} columns
 * @returns
 */
const getTableHeadData = (columns) => {
  return columns
    .map((column) => {
      const { display_name } = column;
      const words = convertFirstLetterToUpperCase(
        display_name.replace(/_/g, ' ')
      );
      return ` <th style="width: ${
        display_name === 'boe_category' && '20%'
      }">${words}</th> `;
    })
    .join('');
};

/**
 * COnvert string to upper case at the first letter
 * @param {*} str (example string: titip_aja_pancoran)
 * @returns (expected output: Titip Aja Pancoran)
 */
const convertFirstLetterToUpperCase = (str) => {
  return str.replace(/(^\w{1})|(\s+\w{1})/g, (letter) => letter.toUpperCase());
};

const buildHtmlContent = async (htmlTemplate, htmlContent) => {
  return htmlTemplate
    .replace(/__TABLE_HEAD__/g, htmlContent.TABLE_HEAD)
    .replace(/__TABLE_DATA__/g, htmlContent.TABLE_DATA)
    .replace(/__MONTH__/g, htmlContent.MONTH)
    .replace(/__YEAR__/g, htmlContent.YEAR)
    .replace(/__GENERATED_AT__/g, htmlContent.GENERATED_AT)
    .replace(/__TOKO_CABANG__/g, htmlContent.TOKO_CABANG);
};

/**
 * Load the Html content
 * @param {*} fileName
 * @returns
 */
const loadHtmlTemplate = async (fileName) => {
  return new Promise((resolve, reject) => {
    try {
      fs.readFile(`${fileName}.html`, 'utf8', (err, data) => {
        if (err) reject(err);
        resolve(data);
      });
    } catch (error) {
      reject(error);
    }
  });
};

// ---------The functions below is for future use as of now we don't support sending data to GMAIL-------//

/**
 * @param {*} mailOptions Sender and Receiver details
 */
const sendEmail = async (mailOptions) => {
  const emailTransporter = await createTransporter();
  try {
    await emailTransporter.sendMail(mailOptions);
  } catch (error) {
    console.log(error, 'Error here');
  }
};

const createTransporter = async () => {
  /**
   * Originally the access token would expire after 3582 seconds
   * and the following code creates OAuth client and provides it with the refresh token.
   */
  const oauth2Client = new OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.DIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.REFRESH_TOKEN,
  });

  try {
    const accessToken = await oauth2Client.getAccessToken();
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.EMAIL, // put with the registered email in Google Cloud Platform
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken: process.env.REFRESH_TOKEN,
        accessToken,
      },
      // put the following code to prevent of getting an 'unauthorized client' error
      tls: {
        rejectUnauthorized: false,
      },
    });
    return transporter;
  } catch (error) {
    console.log('Error here', error);
  }
};
