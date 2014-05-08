passext
=======

An extension that connects the Google Chrome browser and ZX2C4 pass.

Warning
-------

This is pre-alpha quality software, the result of a three day project. It will
crash your browser, leak your passwords and destroy your home. This is actually
my first Chrome extension and I am no expert javascript programmer. I wrote
this because I needed it.

Requirements
------------

I assume that you are familiar with [ZX2C4
pass](http://www.zx2c4.com/projects/password-store/) and that you have the
necessary skills to follow the instructions below. The development system is
Arch Linux, and I use the open-source variant of Google Chrome called Chromium.
You need a working Python 2.x installation.

How it works
------------

The extension needs access to the pass database and gpg for decryption. Due to
Chrome's security model, the javascript code of the extension is cut off from
the outside world. The only way to get things done is through Chrome's Native
Messaging API, which allows an extension to communicate with a single
designated executable that has to be registered beforehand. In *passext*, a
Python 2 script called `passext-host` is used for that. It is located in the
`host/` subdirectory along with the required manifest json file.

`passext-host` uses its own instance of `gpg-agent` so that the private gpg key
passphrase has to be entered only once every hour.

For more information look at the code, it is rather well-documented.

Installation
------------

Installation requires a good deal of manual work at the moment.

- Clone the repository from *http://github.com/gustaebel/passext/*.
- Create one of the following directories:
  - `$HOME/.config/google-chrome/NativeMessagingHosts`: if you use the
    closed-source Chrome browser.
  - `$HOME/.config/chromium/NativeMessagingHosts`: if you use the open-source
    Chromium browser.
  - `/etc/opt/chrome/native-messaging-hosts`: if you want to install
    `passext-host` system-wide (works probably only with closed-source Chrome,
    but I haven't tested that yet).
- Copy the file `host/de.gustaebel.passext.json` to the directory you just made.
- Switch on Chrome's developer mode under *chrome://extensions*.
- Use the `Load unpacked extension` button that has just appeared, and point it
  to the `app` directory inside the cloned sources that contains the
  `manifest.json` file.
- Put the ID string that shows up on the third line of the installed
  extension's information text in the clipboard, it looks something like
  `gkoaeogpibocnapaolecalmngkkdbjdi`.
- Edit `de.gustaebel.passext.json`, put the absolute path to the `passext-host`
  script in `path` and replace the ID in the `chrome-extension://` field in
  `allowed_origins` with the ID you have in the clipboard.

The password database
---------------------

*passext* expects a particular format of the database entries so that it can
match the URLs of webpages to credentials in the password database and extract
all useful information.

- One file per credential.
- A file must consist of the password as the first line, and a minimum of two
  following lines with key-value pairs that contain the login name and the url.
- Keys are separated from values by a colon.
- The key to use for the login name may be one of `login`, `user`, `username`
  or `name`.
- The key to use for the url may be one of `url`, `uri`, `host` or `homepage`.
- Additionally, if there is a key called `pattern` it is used to match against
  web page URLs. It is a simple Python `fnmatch` pattern similar to the shell
  globbing syntax.

An example:

    <password>
    login: gustaebel
    pattern: *github.com/*
    url: https://github.com/gustaebel/

Usage
-----

*passext* is easy to use once it is set up properly. At the right side of the
location bar there is a gray *P* icon. If you click it the passphrase dialog
appears that lets you unlock the password database. On success the *P* icons
turns green.

From now on, everytime you visit a page that has an html password input field
and for which a set of credentials is found, a green bubble appears beside it
that asks you if you want to insert the password into the input field.

Input fields for login names are sometimes hard to detect because they are not
standardized the same way as password fields. *passext* uses a heuristic to
find them. If the wrong input field was chosen or if it could not be detected
at all, you can use the right-click context menu to insert login name and
password into any input field you like to.

