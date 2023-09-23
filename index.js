require("dotenv").config({ path: ".env" })
const axios = require("axios")
const ejs = require("ejs")
const fs = require("fs")
const puppeteer = require("puppeteer")
const QRCode = require('qrcode')


const getPostsDevTo = async (username) => {
    const response = await axios.get(`https://dev.to/api/articles?username=${username}`)
    return response.data
}

const generateQrcode = (text) => {
    return new Promise((resolve, reject) => {
        QRCode.toDataURL(text, function (err, url) {
            if (err) {
                return reject(err)
            }
            resolve(url);
        })
    })
}

const getHtmlWithLastPost = (data) => {
    const template = `
    <div>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
        <h1 style="text-transform: uppercase; text-align: center; font-size: 2em;">My Last post DEV.TO</h1>
        <% for (let index = 0; index < posts.length; index += 1) { %>
            <div style="margin-bottom: 10px">
                    <p style="text-align: center; font-size: 1.5em;">
                    <%= posts[index].title %>
                </p>
                <img style="width: 40%; margin-left: 30%;" src="<%= posts[index].qrcode %>" />
            </div>
        <% } %>
    </div>
    `
    const templateCompiled = ejs.compile(template)
    return templateCompiled({ posts: data })
}

const getFileSha = async (path) => {
    try {
        const responseGithub = await axios.get(
            `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_REPOSITORY}/contents/${path}`,
            {
                headers: {
                    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
                }
            }
        )

        return responseGithub.data.sha;
    } catch (error) {
        if (error.response && error.response.data.message === "Not Found") {
            return null
        }
        throw error;
    }

}

const uploadFileToRepository = async (path, data) => {
    var config = {
        method: 'put',
        url: `https://api.github.com/repos/${process.env.GITHUB_USERNAME}/${process.env.GITHUB_USERNAME}/contents/${path}`,
        headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        data: data
    };

    const response = await axios(config);
    console.log(response.data.content.download_url)
}


const takeScreenshoot = async (posts) => {
    const browser = await puppeteer.launch({
        ignoreDefaultArgs: ["--hide-scrollbars"],
        headless: true
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 500, height: 300 })
    await page.goto('about:blank')
    await page.setContent(getHtmlWithLastPost(posts))
    await page.waitForTimeout(1000)
    await page.screenshot({ path: process.env.PATH_SCREENSHOOT, fullPage: true })
    await browser.close()
}

const start = async () => {
    let posts = await getPostsDevTo(process.env.DEVTO_USERNAME)
    posts = posts.filter((_, index) => {
        return index < 1
    }).map(item => {
        return {
            link: item.url || "",
            title: item.title || ""
        }
    })

    for (let index = 0; index < posts.length; index += 1) {
        posts[index].qrcode = await generateQrcode(posts[index].link)
    }

    console.log(posts)
    await takeScreenshoot(posts)
    const sha = await getFileSha(process.env.FILE_TO_UPLOAD)
    const buffer = fs.readFileSync(process.env.PATH_SCREENSHOOT)
    let data = {
        "message": "add new last article dev.to",
        "content": buffer.toString("base64"),
    }

    if (sha) {
        data.sha = sha
    }

    data = JSON.stringify(data)
    await uploadFileToRepository(process.env.FILE_TO_UPLOAD, data)
    console.log("FINISHED PROCESS TO TAKE SCREENSHOOT LAST POST DEV.TO")
}

start();